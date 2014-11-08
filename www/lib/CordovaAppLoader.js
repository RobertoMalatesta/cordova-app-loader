var CordovaAppLoader =
/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId])
/******/ 			return installedModules[moduleId].exports;
/******/
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			exports: {},
/******/ 			id: moduleId,
/******/ 			loaded: false
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.loaded = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(0);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ function(module, exports, __webpack_require__) {

	var CordovaFileCache = __webpack_require__(1);
	var Promise = null;

	function AppLoader(options){
	  if(!options) throw new Error('CordovaAppLoader has no options!');
	  if(!options.fs) throw new Error('CordovaAppLoader has no "fs" option (cordova-promise-fs)');
	  if(!options.serverRoot) throw new Error('CordovaAppLoader has no "serverRoot" option.');
	  if(!window.pegasus || !window.Manifest) throw new Error('CordovaAppLoader bootstrap.js is missing.');
	  Promise = options.fs.Promise;
	  
	  // initialize variables 
	  this.manifest = window.Manifest;
	  this.newManifest = null;

	  // normalize serverRoot and set remote manifest url
	  options.serverRoot = options.serverRoot || '';
	  if(!!options.serverRoot && options.serverRoot[options.serverRoot.length-1] !== '/') options.serverRoot += '/';
	  this.newManifestUrl = options.serverRoot + (options.manifest || 'manifest.json');
	 
	  // initialize a file cache
	  this.cache = new CordovaFileCache(options);

	  // private stuff
	  this._toBeDeleted = [];
	  this._toBeDownloaded = [];
	  this._updateReady = false;
	}

	AppLoader.prototype.check = function(newManifest){
	  var self = this, manifest = this.manifest;

	  return new Promise(function(resolve,reject){
	    if(typeof newManifest === "string") {
	      self.newManifestUrl = newManifest;
	      newManifest = undefined;
	    }

	    function checkManifest(newManifest){
	      // make sure cache is ready for the DIFF operations!
	      self.cache.ready.then(function(){
	        if(!newManifest.files){
	          reject('Downloaded Manifest has no "files" attribute.');
	          return;
	        }
	  
	        // Create the diff
	        self._toBeDownloaded = Object.keys(newManifest.files)
	          .filter(function(file){
	            return !manifest.files[file]
	                   || manifest.files[file].version !== newManifest.files[file].version
	                   || !self.cache.isCached(file);
	          });
	        
	        self._toBeDeleted = Object.keys(manifest.files)
	          .filter(function(file){
	            return !newManifest.files[file] && self.cache.isCached(file);
	          })
	          .concat(self._toBeDownloaded);

	        if(self._toBeDeleted.length > 0){
	          // Save the new Manifest
	          self.newManifest = newManifest;
	          self.newManifest.root = self.cache.toInternalURL('/') + (self.newManifest.root || '');
	          resolve(true);
	        } else {
	          resolve(false);
	        }
	      },reject);
	    }
	    if(typeof newManifest === "object") {
	      checkManifest(newManifest);
	    } else {
	      pegasus(self.newManifestUrl).then(checkManifest,reject);
	    }
	  });
	};

	AppLoader.prototype.canDownload = function(){
	  return !!this.newManifest;
	};

	AppLoader.prototype.canUpdate = function(){
	  return this._updateReady;
	};

	AppLoader.prototype.download = function(onprogress){
	  var self = this;
	  if(!self.canDownload()) {
	    return Promise.resolve(null);
	  }
	  // we will delete files, which will invalidate the current manifest...
	  localStorage.removeItem('manifest');
	  this.manifest.files = Manifest.files = {};
	  return self.cache.remove(self._toBeDeleted,true)
	    .then(function(){
	      self.cache.add(self._toBeDownloaded);
	      return self.cache.download(onprogress);
	    }).then(function(){
	      self._toBeDeleted = [];
	      self._updateReady = true;
	      return self.newManifest;
	    });
	};

	AppLoader.prototype.update = function(){
	  if(this._updateReady) {
	    // update manifest
	    localStorage.setItem('manifest',JSON.stringify(this.newManifest));
	    location.reload();
	    return true;
	  }
	  return false;
	};

	AppLoader.prototype.clear = function(){
	  localStorage.removeItem('manifest');
	  return this.cache.clear();
	};

	AppLoader.prototype.reset = function(){
	  return this.clear().then(function(){
	    location.reload();
	  });
	};

	module.exports = AppLoader;

/***/ },
/* 1 */
/***/ function(module, exports, __webpack_require__) {

	var hash = __webpack_require__(2);
	var Promise = null;

	/* Cordova File Cache x */
	function FileCache(options){
	  // cordova-promise-fs
	  this._fs = options.fs;
	  if(!this._fs) {
	    throw new Error('Missing required option "fs". Add an instance of cordova-promise-fs.');
	  }
	  // Use Promises from fs.
	  Promise = this._fs.Promise;

	  // 'mirror' mirrors files structure from "serverRoot" to "localRoot"
	  // 'hash' creates a 1-deep filestructure, where the filenames are hashed server urls (with extension)
	  this._mirrorMode = options.mode !== 'hash';
	  this._retry = options.retry || [500,1500,8000];

	  // normalize path
	  this._localRoot = options.localRoot || 'data';
	  if(this._localRoot[this._localRoot.length -1] !== '/') this._localRoot += '/';
	  if(this._localRoot[0] !== '/') this._localRoot = '/' + this._localRoot;

	  this._serverRoot = options.serverRoot || '';
	  if(!!this._serverRoot && this._serverRoot[this._serverRoot.length-1] !== '/') this._serverRoot += '/';
	  if(this._serverRoot === './') this._serverRoot = '';

	  // set internal variables
	  this._downloading = [];    // download promises
	  this._added = [];          // added files
	  this._cached = {};         // cached files

	  // list existing cache contents
	  this.ready = this.list();
	}

	/**
	 * Helper to cache all 'internalURL' and 'URL' for quick synchronous access
	 * to the cached files.
	 */
	FileCache.prototype.list = function list(){
	  var self = this;
	  return new Promise(function(resolve,reject){
	    self._fs.list(self._localRoot,'rfe').then(function(entries){
	      self._cached = {};
	      entries = entries.map(function(entry){
	        self._cached[entry.fullPath] = {
	          toInternalURL: entry.toInternalURL(),
	          toURL: entry.toURL(),
	        };
	        return entry.fullPath;
	      });
	      resolve(entries);
	    },function(){
	      resolve([]);
	    });
	  });
	};

	FileCache.prototype.add = function add(urls){
	  if(typeof urls === 'string') urls = [urls];
	  var self = this;
	  urls.forEach(function(url){
	    url = self.toServerURL(url);
	    if(self._added.indexOf(url) === -1) {
	      self._added.push(url);
	    }
	  });
	  return self.isDirty();
	};

	FileCache.prototype.remove = function remove(urls,returnPromises){
	  var promises = [];
	  if(typeof urls === 'string') urls = [urls];
	  var self = this;
	  urls.forEach(function(url){
	    var index = self._added.indexOf(self.toServerURL(url));
	    if(index >= 0) self._added.splice(index,1);
	    var path = self.toPath(url);
	    promises.push(self._fs.remove(path));
	    delete self._cached[path];
	  });
	  return returnPromises? Promise.all(promises): self.isDirty();
	};

	FileCache.prototype.getDownloadQueue = function(){
	  var self = this;
	  var queue = self._added.filter(function(url){
	    return !self.isCached(url);
	  });
	  return queue;
	};

	FileCache.prototype.getAdded = function() {
	  return this._added;
	};

	FileCache.prototype.isDirty = function isDirty(){
	  return this.getDownloadQueue().length > 0;
	};

	FileCache.prototype.download = function download(onprogress){
	  var fs = this._fs;
	  var self = this;
	  self.abort();

	  return new Promise(function(resolve,reject){
	    // make sure cache directory exists and that
	    // we have retrieved the latest cache contents
	    // to avoid downloading files we already have!
	    fs.ensure(self._localRoot).then(function(){
	      return self.list();
	    }).then(function(){
	      // no dowloads needed, resolve
	      if(!self.isDirty()) {
	        resolve(self);
	        return;
	      }

	      // keep track of number of downloads!
	      var queue = self.getDownloadQueue();
	      var index = self._downloading.length;
	      var total = self._downloading.length + queue.length;

	      // augment progress event with index/total stats
	      var onSingleDownloadProgress;
	      if(typeof onprogress === 'function') {
	        onSingleDownloadProgress = function(ev){
	          ev.index = index;
	          ev.total = total;
	          onprogress(ev);
	        };
	      }

	      // callback
	      var onDone = function(){
	        index++;
	        // when we're done
	        if(index !== total) {
	          // reset downloads
	          self._downloading = [];
	          // check if we got everything
	          self.list().then(function(){
	            // Yes, we're not dirty anymore!
	            if(!self.isDirty()) {
	              resolve(self);
	            // Aye, some files got left behind!
	            } else {
	              reject(self.getDownloadQueue());
	            }
	          },reject);
	        }
	      };

	      // download every file in the queue (which is the diff from _added with _cached)
	      queue.forEach(function(url,index){
	        var download = fs.download(url,self.toPath(url),{retry:self._retry},onSingleDownloadProgress);
	        download.then(onDone,onDone);
	        self._downloading.push(download);
	      });
	    },reject);
	  });
	};

	FileCache.prototype.abort = function abort(){
	  this._downloading.forEach(function(download){
	    download.abort();
	  });
	  this._downloading = [];
	};

	FileCache.prototype.isCached = function isCached(url){
	  url = this.toPath(url);
	  return !!this._cached[url];
	};

	FileCache.prototype.clear = function clear(){
	  this._cached = {};
	  return this._fs.removeDir(this._localRoot);
	};

	/**
	 * Helpers to output to various formats
	 */
	FileCache.prototype.toInternalURL = function toInternalURL(url){
	  path = this.toPath(url);
	  if(this._cached[path]) return this._cached[path].toInternalURL;
	  return 'cdvfile://localhost/'+(this._fs.options.persistent?'persistent':'temporary')+path;
	};

	FileCache.prototype.get = FileCache.prototype.toInternalURL;

	FileCache.prototype.toDataURL = function toDataURL(url){
	  return this._fs.toDataURL(this.toPath(url));
	};

	FileCache.prototype.toURL = function toInternalURL(url){
	  path = this.toPath(url);
	  return this._cached[path]? this._cached[path].toURL: url;
	};

	FileCache.prototype.toServerURL = function toServerURL(path){
	  return path.indexOf('://') < 0? this._serverRoot + path: path;
	};

	/**
	 * Helper to transform remote URL to a local path (for cordova-promise-fs)
	 */
	FileCache.prototype.toPath = function toPath(url){
	  if(this._mirrorMode) {
	    url = url || '';
	    len = this._serverRoot.length;
	    if(url.substr(0,len) !== this._serverRoot) {
	      if(url[0] === '/') url = url.substr(1);
	      return this._localRoot + url;
	    } else {
	      return this._localRoot + url.substr(len);
	    }
	  } else {
	    return this._localRoot + hash(url) + url.substr(url.lastIndexOf('.'));
	  }
	};

	module.exports = FileCache;

/***/ },
/* 2 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * JS Implementation of MurmurHash3 (r136) (as of May 20, 2011)
	 * 
	 * @author <a href="mailto:gary.court@gmail.com">Gary Court</a>
	 * @see http://github.com/garycourt/murmurhash-js
	 * @author <a href="mailto:aappleby@gmail.com">Austin Appleby</a>
	 * @see http://sites.google.com/site/murmurhash/
	 * 
	 * @param {string} key ASCII only
	 * @param {number} seed Positive integer only
	 * @return {number} 32-bit positive integer hash 
	 */

	function murmurhash3_32_gc(key, seed) {
	  var remainder, bytes, h1, h1b, c1, c1b, c2, c2b, k1, i;
	  
	  remainder = key.length & 3; // key.length % 4
	  bytes = key.length - remainder;
	  h1 = seed;
	  c1 = 0xcc9e2d51;
	  c2 = 0x1b873593;
	  i = 0;
	  
	  while (i < bytes) {
	      k1 = 
	        ((key.charCodeAt(i) & 0xff)) |
	        ((key.charCodeAt(++i) & 0xff) << 8) |
	        ((key.charCodeAt(++i) & 0xff) << 16) |
	        ((key.charCodeAt(++i) & 0xff) << 24);
	    ++i;
	    
	    k1 = ((((k1 & 0xffff) * c1) + ((((k1 >>> 16) * c1) & 0xffff) << 16))) & 0xffffffff;
	    k1 = (k1 << 15) | (k1 >>> 17);
	    k1 = ((((k1 & 0xffff) * c2) + ((((k1 >>> 16) * c2) & 0xffff) << 16))) & 0xffffffff;

	    h1 ^= k1;
	        h1 = (h1 << 13) | (h1 >>> 19);
	    h1b = ((((h1 & 0xffff) * 5) + ((((h1 >>> 16) * 5) & 0xffff) << 16))) & 0xffffffff;
	    h1 = (((h1b & 0xffff) + 0x6b64) + ((((h1b >>> 16) + 0xe654) & 0xffff) << 16));
	  }
	  
	  k1 = 0;
	  
	  switch (remainder) {
	    case 3: k1 ^= (key.charCodeAt(i + 2) & 0xff) << 16;
	    case 2: k1 ^= (key.charCodeAt(i + 1) & 0xff) << 8;
	    case 1: k1 ^= (key.charCodeAt(i) & 0xff);
	    
	    k1 = (((k1 & 0xffff) * c1) + ((((k1 >>> 16) * c1) & 0xffff) << 16)) & 0xffffffff;
	    k1 = (k1 << 15) | (k1 >>> 17);
	    k1 = (((k1 & 0xffff) * c2) + ((((k1 >>> 16) * c2) & 0xffff) << 16)) & 0xffffffff;
	    h1 ^= k1;
	  }
	  
	  h1 ^= key.length;

	  h1 ^= h1 >>> 16;
	  h1 = (((h1 & 0xffff) * 0x85ebca6b) + ((((h1 >>> 16) * 0x85ebca6b) & 0xffff) << 16)) & 0xffffffff;
	  h1 ^= h1 >>> 13;
	  h1 = ((((h1 & 0xffff) * 0xc2b2ae35) + ((((h1 >>> 16) * 0xc2b2ae35) & 0xffff) << 16))) & 0xffffffff;
	  h1 ^= h1 >>> 16;

	  return h1 >>> 0;
	}

	module.exports = murmurhash3_32_gc;

/***/ }
/******/ ])