var path = require('path');

var data = {};

var getter = function (name) {
  return function () {
    return data[name];
  }
};

var setter = function (name) {
  return function (value) {
    data[name] = value;
    return data[name];
  }
};

module.exports = {
  setInput: setter('input'),
  getInput: getter('input'),
  setOutput: setter('output'),
  getOutput: getter('output'),
  setName: setter('name'),
  getName: getter('name'),
  setTimelapse: setter('timelapse'),
  getTimelapse: getter('timelapse'),
  setTimelapses: setter('timelapses'),
  getTimelapses: getter('timelapses'),
  getOutputFile: function () {
    return path.join(data.output, data.name);
  },
  getOutputFilePreview: function () {
    return path.join(data.output, 'preview-' + data.name);
  }
};
