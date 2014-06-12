#!/usr/bin/env node

var q = require('q'),
    fs = require('q-io/fs'),
    _ = require('lodash'),
    path = require('path'),
    ExifImage = require('exif').ExifImage;
    home = require('./src/home'),
    prompts = require('./src/prompts'),
    files = require('./src/files'),
    log = require('./src/log'),
    timelapse = require('./src/timelapse');

var generateTimelapse = function () {
  return prompts.timelapseBoundaries().then(timelapse.generate);
}

var timelapseLoop = function () { 
  return prompts.timelapse()
    .then(prompts.preview)
    .then(function (withPreview) {
      if (withPreview === true) {
        return timelapse.generatePreview().then(prompts.previewOk).then(function (previewOk) {
          if (previewOk === true) {
            return generateTimelapse();
          }
        });
      } else {
        return generateTimelapse();
      }
    })
    .then(timelapseLoop);
};

var getFilesTer = function getFilesTerF(inputDir) {
  var isRoot = !!inputDir;
  inputDir = inputDir || workspace.getInput();

  return fs.list(inputDir).then(function (files) {
    var total = files.length;

    if (isRoot) {
      log.info('Start reading ' + total + ' files and/or directories and extracting EXIF infos (can take a few '+ (total < 300 ? 'seconds' : 'minutes') +')...');
    } else {
      log.info('Found a directory, importing ' + total + ' more files and extracting EXIF infos (can take a few '+ (total < 300 ? 'seconds' : 'minutes') +')...');
    }

    return q.allSettled(_.map(files, function (fileName, index) {
      var filePath = path.join(inputDir, fileName);
      return fs.stat(filePath).then(function (stats) {
        if (stats.isFile()) {
          var defer = q.defer();
          try {
            new ExifImage({ image : filePath }, function (err, exifData) {
              if (err) {
                log.warn('couldn\'t read EXIF data from "' + filePath + '"');
                if (index === total-1) log.json(err);
                if (index === total-1) log.json(exifData);
                defer.reject(err);
              } else {
                defer.resolve({
                  path: filePath,
                  width: exifData.exif.ExifImageWidth,
                  height: exifData.exif.ExifImageHeight,
                  created: exifDate(exifData.exif.CreateDate),
                  dateTimeOriginal: exifDate(exifData.exif.DateTimeOriginal),
                  hardware: exifData.image.Make + '---' + exifData.image.Model
                });
              }
            });
          } catch (error) {
            defer.reject(err);
          }
          return defer.promise;
        } else if (stats.isDirectory()) {
          return getFilesTerF(filePath);
        } else {
          return q([]);
        }
      });
    })).then(function (promises) {
      log.info('Removing invalid files and ordering by created date...');
      return _(promises).filter(function (promise) {
        return promise.state === 'fulfilled';
      }).map(function (promise) {
        return promise.value;
      }).flatten().sortBy(function (file) {
        return file.created.getTime();
      }).value();
    });
  });
};


home.check()
  .then(prompts.workspace)
  .then(function () { return undefined; })
  // .then(files.read)
  .then(getFilesTer)
  .then(timelapse.analyse)
  .then(timelapseLoop)
  .catch(function (error) {
    console.log(error);
  })
  .finally(function () {
    console.log('Last clean...');
    home.clean();
  })
  .done();
