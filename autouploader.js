var url = '';
const watchFolderName = '3D print dropfolder';
const userPaths = require('platform-folders');
const winston = require('winston');
require('winston-daily-rotate-file');
const desktopDir = userPaths.getDesktopFolder();
const fs = require('fs');
const http = require('http');
const pathO = require('path');
var hoursBeforeRemoving = 48;
var watchFolder = pathO.join(desktopDir, watchFolderName);
//var finishedFolder = pathO.join(desktopDir, watchFolderName,'_finished');
var readyFolder = pathO.join(desktopDir, watchFolderName,'_processed');
var errorFolder = pathO.join(desktopDir, watchFolderName,'_error');
var logsFolder = pathO.join(desktopDir, watchFolderName,'_logs');
const myArgs = process.argv.slice(2);


const myFormat = winston.format.printf(({ level, message, label, timestamp }) => {
  return `${timestamp} [${label}] ${level}: ${message}`;
});
var transport = new winston.transports.DailyRotateFile({
  filename: pathO.join(logsFolder, 'application-%DATE%.log'),
  datePattern: 'YYYY-MM-DD-HH',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d'
});
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.label({ label: 'Monitor' }),
    winston.format.timestamp(),
    myFormat
  ),
  defaultMeta: { service: 'user-service' },
  transports: [transport],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({}));
}

if (!init())
  return;

// Setup folder watchers
var chokidar = require('chokidar');
const { create } = require('domain');
var watcher = chokidar.watch(watchFolder, {
    ignored: /^\./, 
    persistent: true,
    depth: 0,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100
}});


watcher
  .on('add', function(path) {logInfo('Found file ' + path);printFile(path);})

function pad(num, size) {
    var s = "000000000" + num;
    return s.substr(s.length-size);
}

function hasRenamedName(fileName){
  //var hasHit = /^\d{6}_\S{3}_/.test(fileName);
  var hasHit = /^\S{3}_/.test(fileName);
  return hasHit;
}


function getDate(){
  var dateObj = new Date();
  var month = dateObj.getUTCMonth() + 1; //months from 1-12
  var day = dateObj.getUTCDate();
  var year = dateObj.getUTCFullYear();

  newdate = year.toString().substring(2,4) + pad(month,2) + pad(day,2);
  return newdate;
 }

function getArgument(arg){
  for (var i = 0;i < myArgs.length - 1; i = i + 2){
    if (myArgs[i] == '-' + arg){
      if (i+1 <= myArgs.length)
        return myArgs[i+1];
    }
  }
  return null;
}

function retry(path){
  logInfo('Re-trying after 20 seconds for ' + path);
  setTimeout(() => {
    printFile(path);
  }, (15000));
}

function printFile(path){
    var fileName = pathO.basename(path);
    if (!fileName.endsWith('.gcode')){
      logInfo(fileName + ' is not a gcode file, will ignore this file and move into ' + errorFolder);
      cleanUp(path, errorFolder);
      return;
    }
    logInfo('Attempt to print file ' + fileName);
    mountSDCard(function(){
      uploadFile(path, function(uploadedFilename){
          startPrint(uploadedFilename, function(){
              cleanUp(pathO.join(pathO.dirname(path),uploadedFilename), readyFolder);
          }, function(){retry(path);})
      }, function(){retry(path);});
    }, function(){retry(path);});
   
    
}

function cleanUp(path, targetFolder, onError){
    var oldPath = path;
    var newPath = pathO.join(targetFolder, pathO.basename(path));
    logInfo('Moving file to ' + newPath);

    fs.rename(oldPath, newPath, function (err) {
      if (err) {
        logError("Error: " + err.message);
        onError(err);
      }
    })
}

function startPrint(uploadedFilename, fnOnready, onError){
  logInfo('Asking printer to start ' + uploadedFilename);
    http.get(url + '/print?filename=' + convertToShortName(uploadedFilename), (resp) => {
        let data = '';
      
        // A chunk of data has been received.
        resp.on('data', (chunk) => {
          data += chunk;
        });
      
        // The whole response has been received. Print out the result.
        resp.on('end', () => {
          logInfo('Printjob sent');
          fnOnready();
        });
      
      }).on("error", (err) => {
          logError("Error: " + err.message);
          onError(err);
      });
}

 function uploadFile(path, fnOnready, onError){
    logInfo('uploading ' + pathO.basename(path));
    var FormData = require('form-data');
    var fs = require('fs');
    var form = new FormData();
    var random_start = makeid(3);
    var fileName = pathO.basename(path);
    var dirPortion = pathO.dirname(path);
    var finalFilename = fileName; 

    var needsRename = !hasRenamedName(fileName);

    var carryOnFn = function(){
      path = pathO.join(dirPortion,finalFilename);
      form.append('data', fs.createReadStream(path));
      form.submit(url + '/edit', function(err, res) {
          try{
              if (res.statusCode == 200){
                logInfo('upload finished successfully');
                  fnOnready(finalFilename);
              }
          res.resume();
          } catch(err){
            logError("Could not reach API; Printer offline?");
            onError(err);
          }
      });
    };

    if (needsRename){
      finalFilename = makeid(3) + '_' + fileName; // getDate() + '_' + 
      fs.rename(path, pathO.join(dirPortion,finalFilename), function(){
        console.log('Renamed file ' + fileName + ' to ' + finalFilename);
        carryOnFn();
      } );
    } else {
      logInfo('File already renamed, starting upload');
      finalFilename = fileName;
      carryOnFn();
    }

    
    
    
 }


 function createDir(dir){
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir, { recursive: true });
    }
 }

 function logInfo(msg){
    logger.log({
      level: 'info',
      message: msg
    });
 }

 function logError(msg){
  logger.log({
    level: 'error',
    message: msg
  });

 }

 function init(){
    let thisIP = getArgument('ip');
    let thisPort = getArgument('p');
    let thisWatchFolder = getArgument('watchFolder') || getArgument('watchfolder');
    let thisHoursBeforeRemoval = getArgument('hoursBeforeRemoval');
    if (getArgument('h') != null || getArgument('-help') != null){
      console.log('Use switches -ip and -p to specify the server location.');
      return false;
    }

    if (thisIP == null){
      logError('Did not provide the required IP address through the -ip switch');
      return false;
    };
    if (thisPort == null){
      logInfo('Using default port 88');
      thisPort = 88;
    }
    if (thisHoursBeforeRemoval != null){
      hoursBeforeRemoving = parseInt(thisHoursBeforeRemoval);
    }

    if (thisWatchFolder != null){
       watchFolder = thisWatchFolder;
       //finishedFolder = pathO.join(thisWatchFolder,'_finished');
       readyFolder = pathO.join(thisWatchFolder,'_processed');
       errorFolder = pathO.join(thisWatchFolder,'_error');
       logsFolder = pathO.join(thisWatchFolder,'_logs');
    }


    url = 'http://' + thisIP + ':' + thisPort;
    createDir(watchFolder);
    createDir(readyFolder);
    createDir(errorFolder);
    createDir(logsFolder);
    //createDir(finishedFolder);
    setInterval(() => {
      cleanUpServerFiles();
    }, (60 * 1000 * 60 * 24));
    cleanUpServerFiles();
    logInfo('Monitoring your gcode files at ' + watchFolder);
    return true;
 }

 function convertToShortName(fullName) {
    var f_name = fullName.replace('/', '');
    var base_name = f_name.replace(/\.[^/.]+$/, '');
    if (base_name.length >= 6) {
      base_name = base_name.substring(0, 6) + '~1';
    } else {
      base_name = base_name + '~1';
    }
    var full_name = base_name + '.GCO';
    return full_name;
  }

  function makeid(length) {
    var result = '';
    var characters =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
  }
  
 function mountSDCard(fnOnready, onError){
  logInfo('Mounting SD card...');
    http.get(url + '/operate?op=GETSD', (resp) => {
        // The whole response has been received. Print out the result.
        resp.on('end', () => {
          logInfo('SD card mounted');
          fnOnready();
        });
        resp.on('data', (data) => { // This needs to be here, otherwise 'end' is never called ?!?
            
        });
      
      }).on("error", (err) => {
        logError("Could not reach API; Printer offline?");
        onError(err);
      });
 }

 function deleteFileFromServer(fileName, fnOnready){
  logInfo('Mounting SD card...');
  http.get(url + '/remove?path=/' + fileName, (resp) => {
      // The whole response has been received. Print out the result.
      resp.on('end', () => {
        logInfo('File deleted from server');
      });
      resp.on('data', (data) => { // This needs to be here, otherwise 'end' is never called ?!?
          
      });
    
    }).on("error", (err) => {
      logError("Error deleting file " + fileName + ": " + err.message);
    });
}

function cleanUpServerFiles(){
  if (hoursBeforeRemoving == 0){
    logInfo('Ignoring cleaning files from server');
    return;
  }
  logInfo('Cleaning Server files');

  // API does not expose file date.
  // Our short name is max 6 characters, leaving us with only 1 print per day if we start with the year, month date accepting that we create a year 2.1K bug.
  logInfo('Ignoring this for now, don\'t have a good way to know the file age yet');
  return;

    http.get(url + '/list?dir=/', (resp) => {
      // The whole response has been received. Print out the result.
      var str = '';
      resp.on('end', () => {
        var files = JSON.parse(str);
        console.log(files);
        files.forEach(file => {
          if (file.type == 'file'){
            var fileExtention = pathO.extname(file.name);
            console.log(file.name, fileExtention);
            if (fileExtention == '.gcode'){

              //logInfo('deleting ' + file.name + ' from server');
              //deleteFileFromServer(file.name);
            }
          }
        });
      });
      resp.on('data', (data) => { // This needs to be here, otherwise 'end' is never called ?!?
        str += data;
      });
    
    }).on("error", (err) => {
      logError("Error: " + err.message);
    });
    return;
}

 function createdDate (file) {  
  const { birthtime } = fs.statSync(file)
  return birthtime
}