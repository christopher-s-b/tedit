var forge = window.forge;
var bodec = require('bodec');
var defer = require('js-git/lib/defer');

module.exports = function (storage, passphrase) {

  require('js-git/mixins/path-to-entry')(storage);
  require('js-git/mixins/mem-cache')(storage);
  require('js-git/mixins/formats')(storage);

  // Derive an AES symetric key from the passphrase
  var hmac = forge.hmac.create();
  hmac.start('sha256', 'kodeforkids');
  hmac.update(passphrase);
  var key = hmac.digest().bytes();

  var repo = {};
  var fs = require('js-git/lib/git-fs')(storage, {
    shouldEncrypt: function (path) {
      // We only want to encrypt the actual blobs
      // Everything else can be plaintext.
      return path.split("/").filter(Boolean)[0] === "objects";
    },
    encrypt: function (plain) {
      var iv = forge.random.getBytesSync(16);
      var cipher = forge.cipher.createCipher('AES-CBC', key);
      cipher.start({iv: iv});
      cipher.update(forge.util.createBuffer(plain));
      cipher.finish();
      var encrypted = cipher.output.bytes();
      return bodec.fromRaw(iv + encrypted);
    },
    decrypt: function (encrypted) {
      var decipher = forge.cipher.createDecipher('AES-CBC', key);
      var iv = bodec.toRaw(encrypted, 0, 16);
      encrypted = bodec.toRaw(encrypted, 16);
      decipher.start({iv: iv});
      decipher.update(forge.util.createBuffer(encrypted));
      decipher.finish();
      return bodec.fromRaw(decipher.output.bytes());
    },
    getRootTree: function (callback) {
      if (rootTree) {
        callback(null, rootTree);
        callback = null;
        if (Date.now() - rootTime < 1000) return;
      }
      storage.readRef("refs/heads/master", function (err, hash) {
        if (!hash) return callback(err);
        storage.loadAs("commit", hash, function (err, commit) {
          if (!commit) return callback(err);
          rootTree = commit.tree;
          rootTime = Date.now();
          if (callback) callback(null, commit.tree);
        });
      });
    },
    setRootTree: function (hash, callback) {
      rootTree = hash;
      rootTime = Date.now();
      defer(saveRoot);
      callback();
    }
  });

  var rootTree;
  var rootTime;
  var saving, savedRoot;
  function saveRoot() {
    if (saving || savedRoot === rootTree) return;
    saving = rootTree;
    storage.saveAs("commit", {
      tree: rootTree,
      author: {
        name: "JS-Git",
        email: "js-git@creationix.com"
      },
      message: "Auto commit to update fs image"
    }, function (err, hash) {
      if (!hash) return onDone(err);
      storage.updateRef("refs/heads/master", hash, function (err) {
        onDone(err);
      }, true);

      function onDone(err) {
        if (!err) savedRoot = saving;
        saving = false;
        if (err) throw err;
      }
    });

  }
  // Don't wait for writes to finish.
  var writeFile = fs.writeFile;
  fs.writeFile = function fastWriteFile(path, value, callback) {
    if (!callback) return fastWriteFile.bind(fs, path, value);
    writeFile.call(fs, path, value, function (err) {
      if (err) console.error(err.stack);
    });
    callback();
  };

  require('js-git/mixins/fs-db')(repo, fs);

  return repo;

};