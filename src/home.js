// API to manage the "home" directory of timelapse.io
// which is ~/.timelapse.io

// paths: {home, tmp, config}
// check(): void
// config(): getter
// save(): writer

var q = require('q'),
    fs = require('q-io/fs'),
    path = require('path'),
    _ = require('lodash'),
    homeDir = require('home-dir').directory,
    log = require('./log'),
    config,
    defaultConfig = {
      inputs: [],
      outputs: [],
      timelapseMinSize: 100,
      speeds: [500, 1000, 2000, 5000, 10000, 30000]
    };

var paths = module.exports.paths = {};

paths.home = path.join(homeDir, '/.timelapse.io');
paths.tmp = path.join(paths.home, '/tmp');
paths.config = path.join(paths.home, '/timelapseio.json');

var createHome = function () {
  return fs.makeDirectory(paths.home);
};

var createTmp = function () {
  return fs.makeDirectory(paths.tmp);
};

var check = module.exports.check = function ()  {
  return fs.isDirectory(paths.home)
    .catch(createHome)
    .then(function () {
      return fs.isDirectory(paths.tmp);
    })
    .catch(createTmp)
    .then(function () {
      return fs.read(paths.config).then(function (content) {
        config = _.defaults(JSON.parse(content), defaultConfig);
        return q(true);
      });
    })
    .catch(function () {
      config = defaultConfig;
      return q(true);
    });
};

var clean = module.exports.clean = function () {
  return fs.removeTree(paths.tmp).then(createTmp);
};

module.exports.config = function () {
  return config;
};

var save = module.exports.save = function () {
  return fs.write(paths.config, JSON.stringify(config, null, 2)).then(function () {
    return config;
  });
};
