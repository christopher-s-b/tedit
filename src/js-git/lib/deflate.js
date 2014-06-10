define("js-git/lib/deflate.js", ["pako/deflate.js"], function (module, exports) { if (typeof process === "object" && typeof process.versions === "object" && process.versions.node) {
  var nodeRequire = require;
  var pako = nodeRequire('pako');
  module.exports = function (buffer) {
    return new Buffer(pako.deflate(new Uint8Array(buffer)));
  };
}
else {
  module.exports = require('pako/deflate.js').deflate;
}

});