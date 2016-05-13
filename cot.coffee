Cot = (opts) ->
  { port, hostname, user, pass, auth, ssl, hostname } = opts

  protocol = if ssl then 'https' else 'http'
  @host = "#{protocol}://#{hostname}:#{port}"

  # adaptor to assure compatibilty with cot-node interface
  if auth? then [ user, pass ] = auth.split ':'
  @user = user
  @pass = pass

  @hostHeader = hostname

  notStandardHttpPort = not ssl and port isnt 80
  notStandardHttpsPort = ssl and port isnt 443
  if notStandardHttpPort or notStandardHttpsPort
    @hostHeader += ':' + port

  return

DbHandle = (cot, name) ->
  @cot = cot
  @name = name
  return

querystring = require 'querystring'
breq = require 'bluereq'

module.exports = Cot

viewQueryKeys = [
  'descending'
  'endkey'
  'endkey_docid'
  'group'
  'group_level'
  'include_docs'
  'inclusive_end'
  'key'
  'limit'
  'reduce'
  'skip'
  'stale'
  'startkey'
  'startkey_docid'
  'update_seq'
]

changesQueryKeys = [
  'filter'
  'include_docs'
  'limit'
  'since'
  'timeout'
]

Cot:: =
  jsonRequest: (method, path, body) ->
    headers =
      accept: 'application/json'
      host: @hostHeader

    params =
      url: "#{@host}#{path}"
      headers: headers

    if body?
      headers['content-type'] = 'application/json'
      params.body = body

    if @user? and @pass?
      params.auth =
        user: @user
        pass: @pass

    verb = method.toLowerCase()

    return breq[verb](params)

  db: (name) -> new DbHandle(this, name)

throwformattedErr = (res, message)->
  { statusCode, body } = res
  message += ": #{statusCode}"

  try bodyStr = JSON.stringify body
  catch err
    console.log "couldn't parse body".yellow
    bodyStr = body

  if bodyStr? then message += " - #{bodyStr}"

  err = new Error message
  err.status = res.statusCode
  err.context = res.body
  throw err

DbHandle:: =
  docUrl: (docId) ->
    if typeof docId isnt 'string' or docId.length is 0
      throw new TypeError 'doc id must be a non-empty string'
    if docId.indexOf('_design/') is 0
      '/' + @name + '/_design/' + encodeURIComponent(docId.substr(8))
    else
      '/' + @name + '/' + encodeURIComponent(docId)

  info: ->
    @cot.jsonRequest 'GET', "/#{@name}"
    .then (res) -> res.body


  get: (docId) ->
    @cot.jsonRequest 'GET', @docUrl(docId)
    .then (res) ->
      if res.statusCode isnt 200
        throwformattedErr res, "error getting doc #{docId}"
      else res.body

  exists: (docId) ->
    @cot.jsonRequest 'GET', @docUrl(docId)
    .then (res) ->
      if res.statusCode is 404 then null
      else if res.statusCode isnt 200
        throwformattedErr res, "error getting doc #{docId}"
      else res.body

  put: (doc) ->
    @cot.jsonRequest 'PUT', @docUrl(doc._id), doc
    .then (res) ->
      if res.statusCode in [ 200, 201, 409 ]
        res.body
      else
        throwformattedErr res, "error putting doc #{doc._id}"


  post: (doc) ->
    @cot.jsonRequest 'POST', "/#{@name}", doc
    .then (res) ->
      if res.statusCode is 201 then res.body
      else if doc._id
        throwformattedErr res, "error posting doc #{doc._id}"
      else
        throwformattedErr res, "error posting new doc"

  batch: (doc) ->
    path = "/#{@name}?batch=ok"
    @cot.jsonRequest('POST', path, doc)
    .then (res) ->
      if res.statusCode is 202 then res.body
      else if doc._id
        throwformattedErr res, "error batch posting doc #{doc._id}"
      else
        throwformattedErr res, "error batch posting new doc"


  update: (docId, fn) ->
    tryIt = ->
      db.exists(docId)
      .then (doc) -> fn doc or _id: docId
      .then (doc) -> db.put doc
      .then (res) ->
        if res.ok then res
        else tryIt()

    db = this
    return tryIt()

  delete: (docId, rev) ->
    url = @docUrl(docId) + '?rev=' + encodeURIComponent(rev)
    @cot.jsonRequest('DELETE', url).then (res) ->
      if res.statusCode is 200
        res.body
      else
        throwformattedErr res, "error deleting doc #{docId}"


  bulk: (docs) ->
    url = "/#{@name}/_bulk_docs"
    @cot.jsonRequest 'POST', url, {docs: docs}
    .then (res) ->
      if res.statusCode isnt 201
        throwformattedErr res, "error posting to _bulk_docs"
      else res.body

  buildQueryString: (query)->
    query ||= {}
    q = {}
    viewQueryKeys.forEach (key) ->
      if query[key]?
        if key is 'startkey_docid' or key is 'endkey_docid'
          q[key] = query[key]
        else
          q[key] = JSON.stringify(query[key])
    return querystring.stringify(q)

  viewQuery: (path, query) ->
    qs = @buildQueryString query
    url = "/#{@name}/#{path}?#{qs}"
    @cot.jsonRequest 'GET', url
    .then (res) ->
      if res.statusCode isnt 200
        throwformattedErr res, "error reading view #{path}"
      else res.body


  view: (designName, viewName, query) ->
    @viewQuery "_design/#{designName}/_view/#{viewName}", query

  allDocs: (query) ->
    @viewQuery '_all_docs', query

  viewKeysQuery: (path, keys, query) ->
    qs = @buildQueryString query
    url = "/#{@name}/#{path}?#{qs}"
    @cot.jsonRequest 'POST', url, {keys: keys}
    .then (res) ->
      if res.statusCode isnt 200
        throwformattedErr res, "error reading view #{path}"
      else res.body


  viewKeys: (designName, viewName, keys, query) ->
    path = "_design/#{designName}/_view/#{viewName}"
    @viewKeysQuery path, keys, query

  allDocsKeys: (keys, query) ->
    @viewKeysQuery '_all_docs', keys, query

  changes: (query) ->
    query ||= {}
    q = {}
    changesQueryKeys.forEach (key) ->
      if query[key]?
        q[key] = JSON.stringify(query[key])

    if query.longpoll then q.feed = 'longpoll'
    qs = querystring.stringify q
    path = "/#{@name}/_changes?#{qs}"

    @cot.jsonRequest 'GET', path
    .then (res) ->
      if res.statusCode isnt 200
        throwformattedErr res, "error reading _changes"
      else res.body
