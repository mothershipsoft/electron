import {
  WebPlugin,
  CopyOptions,
  CopyResult,
  FileReadOptions,
  FileReadResult,
  FilesystemPlugin,
  FileWriteOptions,
  FileWriteResult,
  FileDeleteResult,
  FileAppendOptions,
  FileAppendResult,
  FilesystemDirectory,
  ReaddirOptions,
  ReaddirResult,
  RenameOptions,
  RenameResult,
  MkdirOptions,
  MkdirResult,
  GetUriOptions,
  RmdirOptions,
  RmdirResult,
  GetUriResult,
  StatOptions,
  StatResult,
  FileDeleteOptions,
} from "@capacitor/core";

export class FilesystemPluginElectron
  extends WebPlugin
  implements FilesystemPlugin {
  NodeFS: any = null;
  fileLocations: any = null;
  Path: any = null;

  constructor() {
    super({
      name: "Filesystem",
      platforms: ["electron"],
    });
    this.fileLocations = { DRIVE_ROOT: "", DOCUMENTS: "" };

    let path = require("path");
    let os = require("os");
    if (os.platform == "win32") {
      this.fileLocations["DRIVE_ROOT"] = process.cwd().split(path.sep)[0];
    } else {
      this.fileLocations["DRIVE_ROOT"] = "/";
    }
    this.fileLocations[FilesystemDirectory.Documents] =
      path.join(os.homedir(), `Documents`) + path.sep;

    this.NodeFS = require("fs");
    this.Path = path;
  }

  private _getPath(
    reject: (error: string) => void,
    path: string,
    directory?: string
  ): string | URL {
    if (!directory) {
      // If there isn't a directory, see if we have a URL
      try {
        const myUrl = new URL(path);
        // We got a URL - check we accept the protocol - if we do, just return the path
        if (myUrl.protocol === "file:") {
          return myUrl;
        } else {
          reject("If you wish to use a url, it must start with file://");
        }
      } catch (e) {
        // We didn't get a url - need to include a directory
        reject(
          "You must give a root directory for that path, or send a file:// url"
        );
      }
    }

    if (Object.keys(this.fileLocations).indexOf(directory) === -1) {
      reject(
        `${directory} is currently not supported in the Electron implementation.`
      );
    }
    return this.fileLocations[directory] + path;
  }

  readFile(options: FileReadOptions): Promise<FileReadResult> {
    return new Promise<FileReadResult>((resolve, reject) => {
      let lookupPath = this._getPath(reject, options.path, options.directory);
      this.NodeFS.readFile(
        lookupPath,
        options.encoding || "binary",
        (err: any, data: any) => {
          if (err) {
            reject(err);
            return;
          }

          resolve({
            data: options.encoding
              ? data
              : Buffer.from(data, "binary").toString("base64"),
          });
        }
      );
    });
  }

  writeFile(options: FileWriteOptions): Promise<FileWriteResult> {
    return new Promise((resolve, reject) => {
      let lookupPath = this._getPath(reject, options.path, options.directory);
      let data: Buffer | string = options.data;
      if (!options.encoding) {
        const base64Data =
          options.data.indexOf(",") >= 0
            ? options.data.split(",")[1]
            : options.data;
        data = Buffer.from(base64Data, "base64");
      }
      let dirPath =
        lookupPath instanceof URL
          ? lookupPath.pathname.substring(1)
          : lookupPath;
      const dstDirectory = this.Path.dirname(dirPath);
      this.NodeFS.stat(dstDirectory, (err: any) => {
        if (err) {
          const doRecursive = options.recursive;
          if (doRecursive) {
            this.NodeFS.mkdirSync(dstDirectory, { recursive: doRecursive });
          }
        }
        this.NodeFS.writeFile(
          lookupPath,
          data,
          options.encoding || "binary",
          (err: any) => {
            if (err) {
              reject(err);
              return;
            }
            resolve({ uri: dirPath });
          }
        );
      });
    });
  }

  appendFile(options: FileAppendOptions): Promise<FileAppendResult> {
    return new Promise((resolve, reject) => {
      let lookupPath = this._getPath(reject, options.path, options.directory);
      let data: Buffer | string = options.data;
      if (!options.encoding) {
        const base64Data =
          options.data.indexOf(",") >= 0
            ? options.data.split(",")[1]
            : options.data;
        data = Buffer.from(base64Data, "base64");
      }
      this.NodeFS.appendFile(
        lookupPath,
        data,
        options.encoding || "binary",
        (err: any) => {
          if (err) {
            reject(err);
            return;
          }

          resolve();
        }
      );
    });
  }

  deleteFile(options: FileDeleteOptions): Promise<FileDeleteResult> {
    return new Promise((resolve, reject) => {
      let lookupPath = this._getPath(reject, options.path, options.directory);
      this.NodeFS.unlink(lookupPath, (err: any) => {
        if (err) {
          reject(err);
          return;
        }

        resolve();
      });
    });
  }

  mkdir(options: MkdirOptions): Promise<MkdirResult> {
    return new Promise((resolve, reject) => {
      let lookupPath = this._getPath(reject, options.path, options.directory);
      const doRecursive = options.recursive;
      this.NodeFS.mkdir(lookupPath, { recursive: doRecursive }, (err: any) => {
        if (err) {
          reject(err);
          return;
        }

        resolve();
      });
    });
  }

  rmdir(options: RmdirOptions): Promise<RmdirResult> {
    let { path, directory, recursive } = options;

    return this.stat({ path, directory }).then((stat) => {
      if (stat.type === "directory") {
        return this.readdir({ path, directory }).then((readDirResult) => {
          if (readDirResult.files.length !== 0 && !recursive) {
            return Promise.reject(`${path} is not empty.`);
          }

          if (!readDirResult.files.length) {
            return new Promise((resolve, reject) => {
              let lookupPath = this._getPath(
                reject,
                options.path,
                options.directory
              );

              this.NodeFS.rmdir(lookupPath, (err: any) => {
                if (err) {
                  reject(err);
                  return;
                }

                resolve();
              });
            });
          } else {
            return Promise.all(
              readDirResult.files.map((f) => {
                return this.rmdir({
                  path: this.Path.join(path, f),
                  directory,
                  recursive,
                });
              })
            ).then(() => {
              return this.rmdir({ path, directory, recursive });
            });
          }
        });
      } else {
        return this.deleteFile({ path, directory });
      }
    });
  }

  readdir(options: ReaddirOptions): Promise<ReaddirResult> {
    return new Promise((resolve, reject) => {
      let lookupPath = this._getPath(reject, options.path, options.directory);
      this.NodeFS.readdir(lookupPath, (err: any, files: string[]) => {
        if (err) {
          reject(err);
          return;
        }

        resolve({ files });
      });
    });
  }

  getUri(options: GetUriOptions): Promise<GetUriResult> {
    return new Promise((resolve, reject) => {
      let lookupPath = this._getPath(reject, options.path, options.directory);
      if (lookupPath instanceof URL) {
        lookupPath = lookupPath.href;
      }
      resolve({ uri: lookupPath });
    });
  }

  stat(options: StatOptions): Promise<StatResult> {
    return new Promise((resolve, reject) => {
      let lookupPath = this._getPath(reject, options.path, options.directory);
      // this.fileLocations[options.directory] + options.path;
      this.NodeFS.stat(lookupPath, (err: any, stats: any) => {
        if (err) {
          reject(err);
          return;
        }

        let lookupUri;
        if (lookupPath instanceof URL) {
          lookupUri = lookupPath.href;
        } else {
          lookupUri = lookupPath;
        }

        resolve({
          type: stats.isDirectory()
            ? "directory"
            : stats.isFile()
            ? "file"
            : "Not available",
          size: stats.size,
          ctime: stats.ctimeMs,
          mtime: stats.mtimeMs,
          uri: lookupUri,
        });
      });
    });
  }

  private _copy(
    options: CopyOptions,
    doRename: boolean = false
  ): Promise<CopyResult> {
    const copyRecursively = (src: string, dst: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        this.NodeFS.stat(src, (err: any, stats: any) => {
          if (err) {
            reject(err);
            return;
          }

          if (stats.isDirectory()) {
            this.NodeFS.mkdir(dst, (err: any) => {
              if (err) {
                reject(err);
                return;
              }

              const files = this.NodeFS.readdirSync(src);
              Promise.all(
                files.map((file: string) =>
                  copyRecursively(
                    src + this.Path.sep + file,
                    dst + this.Path.sep + file
                  )
                )
              )
                .then(() => resolve())
                .catch(reject);
              return;
            });

            return;
          }

          const dstParent = this.Path.dirname(dst).split(this.Path.sep).pop();
          this.NodeFS.stat(dstParent, (err: any) => {
            if (err) {
              this.NodeFS.mkdirSync(dstParent);
            }

            this.NodeFS.copyFile(src, dst, (err: any) => {
              if (err) {
                reject(err);
                return;
              }

              resolve();
            });
          });
        });
      });
    };

    return new Promise((resolve, reject) => {
      if (!options.from || !options.to) {
        reject("Both to and from must be supplied");
        return;
      }

      if (!options.toDirectory) {
        options.toDirectory = options.directory;
      }

      if (Object.keys(this.fileLocations).indexOf(options.directory) === -1) {
        reject(
          `${options.directory} is currently not supported in the Electron implementation.`
        );
        return;
      }

      if (Object.keys(this.fileLocations).indexOf(options.toDirectory) === -1) {
        reject(
          `${options.toDirectory} is currently not supported in the Electron implementation.`
        );
        return;
      }

      const fromPath = this.fileLocations[options.directory] + options.from;
      const toPath = this.fileLocations[options.toDirectory] + options.to;

      if (doRename) {
        this.NodeFS.rename(fromPath, toPath, (err: any) => {
          if (err) {
            reject(err);
            return;
          }

          resolve();
        });
      } else {
        copyRecursively(fromPath, toPath)
          .then(() => resolve())
          .catch(reject);
      }
    });
  }

  copy(options: CopyOptions): Promise<CopyResult> {
    return this._copy(options, false);
  }

  rename(options: RenameOptions): Promise<RenameResult> {
    return this._copy(options, true);
  }
}

const Filesystem = new FilesystemPluginElectron();

export { Filesystem };
