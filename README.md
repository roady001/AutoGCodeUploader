# Fiberpunk AutoUploader

If you have your 3D printer connected to a [Fiberpunk Node](https://fiber-punk.com/), you may find this tool useful. It will monitor a particular folder on your computer for .gcode files and once found will auto-upload this to your Node/Printer and start the print.

## Prerequisites
[NodeJS](https://nodejs.org/en/download/) needs to be installed.

## Installation

Download the ZIP file and unpack to your computer. Open a terminal inside that folder. Use the package manager npm to install all dependencies automatically.

```bash
npm install
```

## Usage
Start the monitoring tool with the 'ip' switch, specifying the IP of your node. If needed, specify the port with the 'p' switch, otherwise it uses the default of 88.

```bash
> node autouploader.js -ip 192.168.1.2

[Monitor] info: Using default port 88
[Monitor] info: Cleaning Server files
[Monitor] info: Monitoring your gcode files at C:\Users\<your user name>\Your Desktop Folder\3D print dropfolder

```

## Switches

-ip > Defines the IP address of the Node\
-p > Defines the port (defaults to 88)\
-watchFolder > Defines the folder where .gcode files are monitored (defaults to Your Desktop Folder\3D print dropfolder)\
-hoursBeforeRemoval > Defines the age in number of hours, gcode files found on the node server needs to be before cleaning/deleting those (defaults to 48, set to 0 to disable).

## Documentation
The script will by default create a folder called '3D print dropfolder' on your Desktop, unless you specify a different location through the switch -watchFolder. Dropping .gcode files into this folder will automatically start the file printing on your 3D printer. Inside this folder, several other folders are created:
* -the root folder itself- (this is where you drop .gcode files into for auto-printing)
* **_error** (contains files that produced an error)
* **_logs** (contains logs, will be auto-cycled)
* **_processed** (contains files that have been send to the printer)

## Run as a service

In case you want to run this script as a Windows Service, you can use the [NSSM tool](http://nssm.cc/download/?page=download). Change the paths in the command below to match your system.

```bash
.\nssm.exe install autoUploadGcode-service "C:\Program Files\nodejs\node.exe" "C:\Your GIT Repo Folder\AutoGCodeUploader\autouploader.js -ip 192.168.1.2"
```
Fill in the proper Path, Startup Directory and Arguments like you would do for directly running the script. You may want to explicitly specify the watchFolder, because Windows Services run under the System Account. Or run the service under your own user credentials.


## Contributing

Pull requests are welcome. For major changes, please open an issue first
to discuss what you would like to change.

## License

[MIT](https://choosealicense.com/licenses/mit/)