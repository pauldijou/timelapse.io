#!/usr/bin/env node

var home = require('./src/home'),
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

home.check()
  .then(prompts.workspace)
  .then(function () { return undefined; })
  .then(files.read)
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
