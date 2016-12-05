// Generated by CoffeeScript 1.11.1
(function() {
  var DbHandle, changesQueryKeys, querystring, throwformattedErr, viewQueryKeys;

  querystring = require('querystring');

  module.exports = DbHandle = function(cot, name) {
    this.cot = cot;
    this.name = name;
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
      return this.cot.jsonRequest('GET', "/" + this.name).then(function(res) {
        return res.body;
      });
    },
    get: function(docId) {
      return this.cot.jsonRequest('GET', this.docUrl(docId)).then(function(res) {
        if (res.statusCode !== 200) {
          return throwformattedErr(res, "error getting doc " + docId);
        } else {
          return res.body;
        }
      });
    },
    exists: function(docId) {
      return this.cot.jsonRequest('GET', this.docUrl(docId)).then(function(res) {
        if (res.statusCode !== 200) {
          return throwformattedErr(res, "error getting doc " + docId);
        } else {
          return true;
        }
      })["catch"](function(err) {
        if (err.statusCode === 404) {
          return false;
        } else {
          throw err;
        }
      });
    },
    put: function(doc) {
      return this.cot.jsonRequest('PUT', this.docUrl(doc._id), doc).then(function(res) {
        var ref;
        if ((ref = res.statusCode) === 200 || ref === 201) {
          return res.body;
        } else {
          return throwformattedErr(res, "error putting doc " + doc._id);
        }
      });
    },
    post: function(doc) {
      return this.cot.jsonRequest('POST', "/" + this.name, doc).then(function(res) {
        if (res.statusCode === 201) {
          return res.body;
        } else if (doc._id) {
          return throwformattedErr(res, "error posting doc " + doc._id);
        } else {
          return throwformattedErr(res, "error posting new doc");
        }
      });
    },
    batch: function(doc) {
      var path;
      path = "/" + this.name + "?batch=ok";
      return this.cot.jsonRequest('POST', path, doc).then(function(res) {
        if (res.statusCode === 202) {
          return res.body;
        } else if (doc._id) {
          return throwformattedErr(res, "error batch posting doc " + doc._id);
        } else {
          return throwformattedErr(res, "error batch posting new doc");
        }
      });
    },
    update: function(docId, fn) {
      var db, tryIt;
      db = this;
      tryIt = function() {
        return db.get(docId)["catch"](function(err) {
          if (err.statusCode === 404) {
            return {
              _id: docId
            };
          } else {
            throw err;
          }
        }).then(function(doc) {
          return db.put(fn(doc));
        }).then(function(res) {
          if (res.ok) {
            return res;
          } else {
            return tryIt();
          }
        });
      };
      return tryIt();
    },
    "delete": function(docId, rev) {
      var url;
      url = this.docUrl(docId) + '?rev=' + encodeURIComponent(rev);
      return this.cot.jsonRequest('DELETE', url).then(function(res) {
        if (res.statusCode === 200) {
          return res.body;
        } else {
          return throwformattedErr(res, "error deleting doc " + docId);
        }
      });
    },
    bulk: function(docs) {
      var url;
      url = "/" + this.name + "/_bulk_docs";
      return this.cot.jsonRequest('POST', url, {
        docs: docs
      }).then(function(res) {
        if (res.statusCode !== 201) {
          return throwformattedErr(res, "error posting to _bulk_docs");
        } else {
          return res.body;
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
      return this.cot.jsonRequest('GET', url).then(function(res) {
        if (res.statusCode !== 200) {
          return throwformattedErr(res, "error reading view " + path);
        } else {
          return res.body;
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
      }).then(function(res) {
        if (res.statusCode !== 200) {
          return throwformattedErr(res, "error reading view " + path);
        } else {
          return res.body;
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
          return q[key] = query[key];
        }
      });
      if (query.longpoll) {
        q.feed = 'longpoll';
      }
      qs = querystring.stringify(q);
      path = "/" + this.name + "/_changes?" + qs;
      return this.cot.jsonRequest('GET', path).then(function(res) {
        if (res.statusCode !== 200) {
          return throwformattedErr(res, "error reading _changes");
        } else {
          return res.body;
        }
      });
    }
  };

  viewQueryKeys = ['descending', 'endkey', 'endkey_docid', 'group', 'group_level', 'include_docs', 'inclusive_end', 'key', 'limit', 'reduce', 'skip', 'stale', 'startkey', 'startkey_docid', 'update_seq'];

  changesQueryKeys = ['filter', 'include_docs', 'limit', 'since', 'timeout', 'descending', 'heartbeat', 'style'];

  throwformattedErr = function(res, message) {
    var body, bodyStr, err, statusCode;
    statusCode = res.statusCode, body = res.body;
    message += ": " + statusCode;
    try {
      bodyStr = JSON.stringify(body);
    } catch (error) {
      err = error;
      console.log("couldn't parse body".yellow);
      bodyStr = body;
    }
    if (bodyStr != null) {
      message += " - " + bodyStr;
    }
    err = new Error(message);
    err.status = res.statusCode;
    err.context = res.body;
    throw err;
  };

}).call(this);