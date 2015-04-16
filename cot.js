// Generated by CoffeeScript 1.9.1
(function() {
  var Cot, DbHandle, Promise, changesQueryKeys, querystring, viewQueryKeys;

  Cot = function(opts) {
    this.port = opts.port;
    this.hostname = opts.hostname;
    this.auth = opts.auth;
    this.ssl = opts.ssl;
    this.http = (opts.ssl ? require('https') : require('http'));
    this.hostHeader = this.hostname;
    if ((!this.ssl && this.port !== 80) || (this.ssl && this.port !== 443)) {
      this.hostHeader += ':' + this.port;
    }
  };

  DbHandle = function(cot, name) {
    this.cot = cot;
    this.name = name;
  };

  querystring = require('querystring');

  Promise = require('bluebird');

  module.exports = Cot;

  viewQueryKeys = ['descending', 'endkey', 'endkey_docid', 'group', 'group_level', 'include_docs', 'inclusive_end', 'key', 'limit', 'reduce', 'skip', 'stale', 'startkey', 'startkey_docid', 'update_seq'];

  changesQueryKeys = ['filter', 'include_docs', 'limit', 'since', 'timeout'];

  Cot.prototype = {
    jsonRequest: function(method, path, body) {
      var deferred, headers, request;
      deferred = Promise.defer();
      headers = {};
      headers['accept'] = 'application/json';
      headers['host'] = this.hostHeader;
      if (body) {
        headers['content-type'] = 'application/json';
      }
      request = this.http.request({
        hostname: this.hostname,
        port: this.port,
        auth: this.auth,
        path: path,
        method: method,
        headers: headers
      });
      request.on('error', deferred.reject.bind(deferred));
      request.on('response', function(response) {
        var buffer;
        response.setEncoding('utf8');
        buffer = '';
        response.on('data', function(data) {
          buffer += data;
        });
        response.on('error', deferred.reject.bind(deferred));
        response.on('end', function() {
          var err, myResponse;
          myResponse = {
            statusCode: response.statusCode,
            unparsedBody: buffer
          };
          if (response.headers['content-type'] === 'application/json') {
            try {
              myResponse.body = JSON.parse(buffer);
            } catch (_error) {
              err = _error;
              deferred.reject(err);
              return;
            }
          }
          deferred.resolve(myResponse);
        });
      });
      if (body) {
        request.end(JSON.stringify(body));
      } else {
        request.end();
      }
      return deferred.promise;
    },
    db: function(name) {
      return new DbHandle(this, name);
    }
  };

  DbHandle.prototype = {
    docUrl: function(docId) {
      if (typeof docId !== 'string' || docId.length === 0) {
        throw new TypeError('doc id must be a non-empty string');
      }
      if (docId.indexOf('_design/') === 0) {
        return '/' + this.name + '/_design/' + encodeURIComponent(docId.substr(8));
      } else {
        return '/' + this.name + '/' + encodeURIComponent(docId);
      }
    },
    info: function() {
      return this.cot.jsonRequest('GET', "/" + this.name).then(function(response) {
        return response.body;
      });
    },
    get: function(docId) {
      return this.cot.jsonRequest('GET', this.docUrl(docId)).then(function(response) {
        var err;
        if (response.statusCode !== 200) {
          err = "error getting doc " + docId + ": " + response.unparsedBody;
          throw new Error(err);
        } else {
          return response.body;
        }
      });
    },
    exists: function(docId) {
      return this.cot.jsonRequest('GET', this.docUrl(docId)).then(function(response) {
        var err;
        if (response.statusCode === 404) {
          return null;
        } else if (response.statusCode !== 200) {
          err = "error getting doc " + docId + ": " + response.unparsedBody;
          throw new Error(err);
        } else {
          return response.body;
        }
      });
    },
    put: function(doc) {
      return this.cot.jsonRequest('PUT', this.docUrl(doc._id), doc).then(function(response) {
        var err, ref;
        if ((ref = response.statusCode) === 200 || ref === 201 || ref === 409) {
          return response.body;
        } else {
          err = "error putting doc " + doc._id + ": " + response.unparsedBody;
          throw new Error(err);
        }
      });
    },
    post: function(doc) {
      return this.cot.jsonRequest('POST', "/" + this.name, doc).then(function(response) {
        var err;
        if (response.statusCode === 201) {
          return response.body;
        } else if (doc._id) {
          err = "error posting doc " + doc._id + ": " + response.unparsedBody;
          throw new Error(err);
        } else {
          throw new Error("error posting new doc: " + response.unparsedBody);
        }
      });
    },
    batch: function(doc) {
      var path;
      path = "/" + this.name + "?batch=ok";
      return this.cot.jsonRequest('POST', path, doc).then(function(response) {
        var err;
        if (response.statusCode === 202) {
          return response.body;
        } else if (doc._id) {
          err = "error batch posting doc " + doc._id + ": " + response.unparsedBody;
          throw new Error(err);
        } else {
          throw new Error("error batch posting new doc: " + response.unparsedBody);
        }
      });
    },
    update: function(docId, fn) {
      var db, tryIt;
      tryIt = function() {
        return db.exists(docId).then(function(doc) {
          return fn(doc || {
            _id: docId
          });
        }).then(function(doc) {
          return db.put(doc);
        }).then(function(response) {
          if (response.ok) {
            return response;
          } else {
            return tryIt();
          }
        });
      };
      db = this;
      return tryIt();
    },
    "delete": function(docId, rev) {
      var url;
      url = this.docUrl(docId) + '?rev=' + encodeURIComponent(rev);
      return this.cot.jsonRequest('DELETE', url).then(function(response) {
        var err;
        if (response.statusCode === 200) {
          return response.body;
        } else {
          err = "error deleting doc " + docId + ": " + response.unparsedBody;
          throw new Error(err);
        }
      });
    },
    bulk: function(docs) {
      var url;
      url = "/" + this.name + "/_bulk_docs";
      return this.cot.jsonRequest('POST', url, {
        docs: docs
      }).then(function(response) {
        if (response.statusCode !== 201) {
          throw new Error("error posting to _bulk_docs: " + response.unparsedBody);
        } else {
          return response.body;
        }
      });
    },
    buildQueryString: function(query) {
      var q;
      query || (query = {});
      q = {};
      viewQueryKeys.forEach(function(key) {
        if (query[key] != null) {
          if (key === 'startkey_docid' || key === 'endkey_docid') {
            return q[key] = query[key];
          } else {
            return q[key] = JSON.stringify(query[key]);
          }
        }
      });
      return querystring.stringify(q);
    },
    viewQuery: function(path, query) {
      var qs, url;
      qs = this.buildQueryString(query);
      url = "/" + this.name + "/" + path + "?" + qs;
      return this.cot.jsonRequest('GET', url).then(function(response) {
        var err;
        if (response.statusCode !== 200) {
          err = "error reading view " + path + ": " + response.unparsedBody;
          throw new Error(err);
        } else {
          return response.body;
        }
      });
    },
    view: function(designName, viewName, query) {
      return this.viewQuery("_design/" + designName + "/_view/" + viewName, query);
    },
    allDocs: function(query) {
      return this.viewQuery('_all_docs', query);
    },
    viewKeysQuery: function(path, keys, query) {
      var qs, url;
      qs = this.buildQueryString(query);
      url = "/" + this.name + "/" + path + "?" + qs;
      return this.cot.jsonRequest('POST', url, {
        keys: keys
      }).then(function(response) {
        var err;
        if (response.statusCode !== 200) {
          err = "error reading view " + path + ": " + response.unparsedBody;
          throw new Error(err);
        } else {
          return response.body;
        }
      });
    },
    viewKeys: function(designName, viewName, keys, query) {
      var path;
      path = "_design/" + designName + "/_view/" + viewName;
      return this.viewKeysQuery(path, keys, query);
    },
    allDocsKeys: function(keys, query) {
      return this.viewKeysQuery('_all_docs', keys, query);
    },
    changes: function(query) {
      var path, q, qs;
      query || (query = {});
      q = {};
      changesQueryKeys.forEach(function(key) {
        if (query[key] != null) {
          return q[key] = JSON.stringify(query[key]);
        }
      });
      if (query.longpoll) {
        q.feed = 'longpoll';
      }
      qs = querystring.stringify(q);
      path = "/" + this.name + "/_changes?" + qs;
      return this.cot.jsonRequest('GET').then(function(response) {
        if (response.statusCode !== 200) {
          throw new Error("error reading _changes: " + response.unparsedBody);
        } else {
          return response.body;
        }
      });
    }
  };

}).call(this);
