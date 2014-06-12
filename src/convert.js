var q = require('q'),
    command = require('./command');

module.exports.convert = function (files, transforms) {
  var command = 'convert ${in}';

  _.forEach(transforms, function (transform) {
    switch (transform.type) {
      case 'rotate':
        command += ' -rotate "' + transform.value + '"';
        break;
      case 'crop':
        var values = transform.value.split(' ');
        var offsets = {};
        if (values.length < 1) {
          offsets.top = offsets.right = offsets.bottom = offsets.left = 0;
        }
        if (values.length === 1) {
          offsets.top = offsets.right = offsets.bottom = offsets.left = values[0];
        } else if (values.length === 2) {
          offsets.top = offsets.bottom = values[0];
          offsets.right = offsets.left = values[1];
        } else if (values.length === 3) {

        } else {
          offsets.top = values[0];
          offsets.right = values[1];
          offsets.bottom = values[2];
          offsets.left = values[3];
        }
        command += ' -crop "+' + offsets.left + '+' + offsets.top + '"';
        command += ' -crop "-' + offsets.right + '-' + offsets.bottom + '"';
        command += ' +repage';
        break;
      case 'resize':
        var values = transform.value.split(' ');
        var dimensions = {};
        if (values.length === 1) {
          dimensions.width = values[0];
          dimensions.height = values[0];
        } else if (values.length === 2) {
          dimensions.width = values[0];
          dimensions.height = values[1];
        }

        if (dimensions.width && dimensions.height) {
          command += ' -resize "' + dimensions.width + 'x' + dimensions.height + '"';
        }
        
        break;
    }

    command += ' ${out}';
  });

  return q.all(_.map(files, function (file)) {
    var fileCommand = command.replace('${in}', file.path).replace('${out}', file.out);
    return command.run(fileCommand);
  });
};
