'use strict';

const cproc = require('child_process');
const readline = require('readline');
const fs = require('fs-extra');
const fg = require('fast-glob');
const path = require('path');
module.exports = exports;
var filesToPickList = [], modulesToPackList = [];
var packageDependent = true;
var localDependencies = [];
var rootDir, entryDir, tempPackingDir;
var totalSize = 0;
var spinner, spinners = [
    "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"
];

function resolveToRootDir(location) {
    let dir = path.resolve(path.normalize(location));
    if (dir.indexOf(rootDir) === -1) throw new Error(`Out of cwd, location: ${location}`);
    else return dir;
}

function getDir(location, relative = false) {
    let realPath = resolveToRootDir(location);
    try {
        let dir = null, base = null, name = null, ext = null, pathInfo = null,
            stat = fs.lstatSync(realPath);
        if (stat.isFile()) {
            pathInfo = path.parse(realPath);
            dir = pathInfo.dir;
            base = pathInfo.base;
            name = pathInfo.name;
            ext = pathInfo.ext;
        }
        else if (stat.isDirectory()) {
            dir = realPath;
        }
        if (dir && relative) {
            dir = path.relative(dir, rootDir);
        }
        return [dir, base, name, ext];
    } catch (error) {
    }
    return [null, null, null, null];
}

function readPackageFileAt(location) {
    try {
        return require(location);
    }
    catch (error) {
        return {};
    }
}

function getPackageDeploymentFiles(pkg) {
    if (pkg && Array.isArray(pkg.files_to_deploy)) {
        return pkg.files_to_deploy;
        // files = fastGlob.sync(files);
    }
    else {
        return [];
    }
}

/**
 * 
 * @param {String} location a location to pick one file or the whole directory
 * @param {Boolean} includeModuleDependencies will pick files from the location as a sub-module. Then will look
 * for the package.json on the location. Files to
 * pick are defined in package.files_to_deploy (array), accept globbing.
 */
function pick(location = './', includeModuleDependencies = false) {
    console.log(`Picking: ${location}`);
    if (typeof location === 'string') {
        let [dir, base, name, ext] = getDir(location);
        //picking a directory
        if (dir && !base) {
            let pkg = readPackageFileAt(path.join(dir, 'package.json'), true);
            let relDir = path.relative(rootDir, dir);
            //keep track of the modules picked
            if (pkg && !modulesToPackList.includes(relDir)) {
                modulesToPackList.push(relDir);
            }
            //check local dependencies
            if (pkg.dependencies) {
                for (let depKey of Object.keys(pkg.dependencies)) {
                    if (pkg.dependencies[depKey].indexOf('file:') === 0) {
                        //local dependency detected, save for later picking.
                        let refPath = pkg.dependencies[depKey].substr(5),
                            depPath = path.resolve(location, refPath);
                        if (!localDependencies.includes(depPath)) {
                            localDependencies.push(depPath);
                        }
                    }
                }
            }
            let files = getPackageDeploymentFiles(pkg);
            //resolve files to rootDir relative
            files = files.map(file =>
                path.relative(rootDir, resolveToRootDir(path.resolve(dir, file))));
            if (includeModuleDependencies) files.push(
                path.relative(rootDir, resolveToRootDir(path.resolve(dir, './node_modules/**/*'))));
            files = files.filter(file => !filesToPickList.includes(file));
            filesToPickList = filesToPickList.concat(files);
            return true;
        }
        else {
            try {
                filesToPickList.push(path.relative(rootDir, path.join(dir, base)));
            } catch (error) {
                // console.log(location, resolveToRootDir(location), dir, base);
                throw error;
            }
            return true;
        }
    }
    return false;
}

function rewriteLine(text) {
    readline.clearLine(process.stdout);
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(text);
}

function getSpinner() {
    var i = 0;
    var spinner = spinners[0];
    var length = spinner.length;
    return {
        spin: () => {
            if (i == spinner.length) i = 0;
            return spinner.charAt(i++);
        }
    };
}

function clear() {
    filesToPickList = [];
}

/**
 * To pack the picked files to a zip file and save to a directory
 * @param {String} dir the directory where it saves the package zip file
 * @param {String} packageName a package name to save as. If not given, function will try to look
 * for the package.jon from the rootDir and use the package name to pack. If no package.json is
 * found, function will stop packing.
 */
// function nimPack(dir = './', packageName = null) {
//     return new Promise((resolve, reject) => {
//         if (!packageName) {
//             let pkg = readPackageFileAt(path.join(rootDir, 'package.json'));
//             packageName = pkg.name;
//         }
//         var saveAsFile;
//         try {
//             let saveDir = resolveToRootDir(dir);
//             saveAsFile = path.resolve(saveDir, `${packageName}.zip`);
//         } catch (err) {
//             reject(err);
//         }
//         var output = fs.createWriteStream(saveAsFile);
//         var archive = archiver('zip', {
//             zlib: { level: 9 } // Sets the compression level.
//         });
//         output.on('close', function () {
//             console.log(`\nPacking completed (${archive.pointer()} total bytes)`);
//             fs.close();
//             resolve(saveAsFile);
//         });
//         output.on('end', function () {
//             console.log('Data has been drained');
//             fs.close();
//             resolve(saveAsFile);
//         });
//         output.on('finished', function () {
//             fs.close();
//             resolve(saveAsFile);
//         });
//         // good practice to catch warnings (ie stat failures and other non-blocking errors)
//         archive.on('warning', function (err) {
//             if (err.code === 'ENOENT') {
//                 // log warning
//                 console.log(JSON.stringify(err));
//             } else {
//                 fs.close();
//                 reject(err);
//             }
//         });
//         // good practice to catch this error explicitly
//         archive.on('error', function (err) {
//             fs.close();
//             reject(err);
//         });
//         // show progress
//         archive.on('progress', function (progress) {
//             rewriteLine(spinner.spin() + "   ");
//         });
//         // pipe archive data to the file
//         archive.pipe(output);
//         // // append a file
//         // archive.file('package.json', { name: 'package.json' });
//         // // append files from a sub-directory and naming it `new-subdir` within the archive
//         // archive.directory(`./tests`, 't2');
//         // append files from a glob pattern
//         let stat, fileCount = 0;
//         totalSize = 0;
//         filesToPickList = fg.sync(filesToPickList);
//         for (let globPattern of filesToPickList) {
//             //resolve each pattern to rootDir relative path
//             let pattern = globPattern.replace(rootDir, '.');
//             try {
//                 stat = fs.lstatSync(pattern);
//                 totalSize += stat.size;
//                 archive.file(pattern);
//                 rewriteLine(`adding file: ${pattern}`);
//                 fileCount++;
//             } catch (err) {
//                 console.log(`ignored: ${pattern}`);
//             }
//             // archive.glob(pattern);
//         }
//         rewriteLine(`${fileCount} files added.files size (${totalSize} total bytes)\n`);
//         // archive.directory(path.join(rootDir, 'az_funcapp', '/node_modules'));
//         // finalize the archive (ie we are done appending files but streams have to finish yet)
//         console.log("Now packing...");
//         archive.finalize();
//     });
// }

function exec(cmd, cwd = process.cwd(), options) {
    return new Promise((resolve, reject) => {
        if (options && options.progressor) {
            rewriteLine(`${spinner.spin()} exec: ${cmd}, on dir: ${cwd}`);
        }

        cproc.exec(cmd, { cwd: cwd }, (err, stdout, stderr) => {
            if (err && options && !options.surpressError) {
                reject(`error: ${err}`);
            }
            else {
                if (!(options && !options.printStdout)) {
                    console.log(stdout);
                }
                resolve(stdout);
            }
        });
    });
}

function spawn(cmd, args = [], cwd = process.cwd(), options) {
    return new Promise((resolve, reject) => {
        if (options && options.progressor) {
            rewriteLine(`${spinner.spin()} exec: ${cmd}, on dir: ${cwd}`);
        }

        let child = cproc.spawn(cmd, args, { cwd: cwd });

        child.stdout.on('data', function (data) {
            if (options && options.printStdout) {
                console.log('stdout: ' + data);
            }
        });

        child.stderr.on('data', function (data) {
            if (options && !options.surpressError) {
                console.log('stderr: ' + data);
            }
            else {
                reject(data);
            }
        });

        child.on('close', function (code) {
            resolve(child.stdout);
        });
    });
}

function setPackEntry(dir) {
    entryDir = dir;
}

/**
 * copy all files in fileToPickList to a temp dir located in the toDir
 */
async function prePack() {
    console.log(`pre-pack start`);
    tempPackingDir = path.resolve(rootDir, './.tmp');
    for (let dep of localDependencies) {
        pick(dep);
    }
    await copy(path.resolve(rootDir, './.tmp'));
    await installAt(path.resolve(tempPackingDir, entryDir));
    //add node_modules of each module to pick list
    for (let mod of modulesToPackList) {
        pick(mod, true);
        await pruneAt(path.resolve(tempPackingDir, mod));
    }
    // await imPack(tempPackingDir);
    console.log(`pre-pack done`);
}

async function move(toDir) {

}

async function imPack(toDir, packageName = null) {
    return new Promise((resolve, reject) => {
        console.log("Now packing...");
        if (!packageName) {
            let pkg = readPackageFileAt(path.join(
                path.resolve(rootDir, entryDir), 'package.json'));
            packageName = pkg.name;
        }
        var saveAsFile, saveDir;
        try {
            saveDir = resolveToRootDir(toDir);
            saveAsFile = path.resolve(saveDir, `${packageName}.zip`);
        } catch (err) {
            reject(err);
        }
        let zipFunc = async () => {
            return await spawn('zip', [`-r`, `${packageName}.zip`, `${entryDir}`],
                tempPackingDir, {
                    surpressError: false, printStdout: false,
                    progressor: true
                });
        };
        let movFunc = async () => {
            return await exec(`mv ${packageName}.zip ${saveDir}`, tempPackingDir,
                (err, stdout, stderr) => {
                    if (err && options && !options.surpressError) {
                        reject(`error: ${err}`);
                    }
                    else {
                        if (!(options && !options.printStdout)) {
                            console.log(stdout);
                        }
                        resolve(stdout);
                    }
                });
        };
        let remFunc = async () => {
            return await exec(`rm -r ./.tmp`, rootDir,
                (err, stdout, stderr) => {
                    if (err && options && !options.surpressError) {
                        reject(`error: ${err}`);
                    }
                    else {
                        if (!(options && !options.printStdout)) {
                            console.log(stdout);
                        }
                        resolve(stdout);
                    }
                });
        };
        return zipFunc().then(movFunc).then(remFunc).then(
            () => console.log(`Package saved as: ${saveAsFile}\nPacking done.`)
        );
    });
}

async function pack(toDir, packageName = null) {
    await prePack();
    await imPack(toDir, packageName);

}

/**
 * call `npm install` at a directory
 * @param {} dir directory to call `npm install`
 */
async function installAt(dir, production = false) {
    let atDir = path.resolve(rootDir, dir);
    console.log(`Installing node modules at ${atDir}`);
    let out = await exec(`npm install ${production ? '--production' : ''}`, atDir, {
        surpressError: false, printStdout: false
    });
    console.log(out);
    console.log(`Node modules installed.`);
}

async function pruneAt(dir, production = false) {
    let atDir = path.resolve(rootDir, dir);
    console.log(`pruning node modules at ${atDir}`);
    let out = await exec(`npm prune ${production ? '--production' : ''}`, atDir, {
        surpressError: false, printStdout: false
    });
    console.log(out);
    console.log(`Node modules pruned.`);
}

async function copy(toDir) {
    console.log(`Coping files to ${toDir}`);
    let stat, fileCount = 0;
    let filesToPickListGlobs = fg.sync(filesToPickList);
    for (let globPattern of filesToPickListGlobs) {
        //resolve each pattern to rootDir relative path
        let pattern = path.resolve(globPattern);
        try {
            stat = fs.lstatSync(pattern);
            totalSize += stat.size;
            let toPath = path.resolve(toDir, globPattern);
            let pInfo = path.parse(toPath);
            await exec(`mkdir -p ${pInfo.dir}`, rootDir, {
                surpressError: false, printStdout: false,
                progressor: true
            });
            fs.copyFileSync(pattern, path.resolve(toDir, toPath), { dereference: true });
            rewriteLine(`copying file: ${pattern}`);
            fileCount++;
        } catch (err) {
            console.log(`ignored: ${pattern}`);
        }
    }
}

function put() {

}

exports.pick = pick;
exports.pack = pack;
exports.setPackEntry = setPackEntry;

exports.setRootDir = function (_rootDir = process.cwd()) {
    rootDir = ((p) => path.join(p.dir, p.base))(path.parse(path.resolve(_rootDir)));
};

//set default cwd to process.cwd()
exports.setRootDir(process.cwd());
entryDir = './';
spinner = getSpinner();
