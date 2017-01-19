require('should')
const cot = require('../lib/cot')
const config = require('./config')

const catch404 = function (err) {
  if (err.statusCode === 404) {
    return
  } else {
    throw err
  }
}

const putSecurityDoc = function (db) {
  const doc = {
    admins: { names: [ config.cot.user ] },
    members: { names: [ config.cot.user ] }
  }
  return db.jsonRequest('PUT', `/${config.dbName}/_security`, doc)
}

describe('DbHandle', function () {
  const db = cot(config.cot)(config.dbName)

  beforeEach(function (done) {
    db.jsonRequest('DELETE', `/${config.dbName}`)
    .catch(catch404)
    .then(() => db.jsonRequest('PUT', `/${config.dbName}`))
    .then(function () {
      if (config.cot.user) return putSecurityDoc(db)
    })
    .then(function () {
      return db.post({
        _id: 'person-1',
        type: 'person',
        name: 'Will Conant'
      })
    })
    .then(function () {
      return db.post({
        _id: '_design/test',
        views: {
          testView: {
            map: 'function(d) { emit(d.name, null) }'
          }
        }
      })
    })
    .then(() => done())
  })

  describe('#docUrl', function () {
    it('should encode doc ids', function (done) {
      const encoded = db.docUrl('foo/bar')
      encoded.should.equal('/test-cot-node/foo%2Fbar')
      done()
    })

    it('should not encode first slash in design doc ids', function (done) {
      const encoded = db.docUrl('_design/foo/bar')
      encoded.should.equal('/test-cot-node/_design/foo%2Fbar')
      done()
    })
  })

  describe('#info', function () {
    it('should return database info', function (done) {
      db.info()
      .then(function (info) {
        info.should.be.an.Object()
        info.doc_count.should.equal(2)
      })
      .then(() => done())
    })
  })

  describe('#get', function () {
    it('should return test document from database', function (done) {
      db.get('person-1')
      .then(function (doc) {
        doc.should.be.an.Object()
        doc.name.should.equal('Will Conant')
      })
      .then(() => done())
    })

    it('should return a 404 when a doc === missing', function (done) {
      db.get('missing-doc-id')
      .catch(function (err) {
        err.statusCode.should.equal(404)
        done()
      })
    })
  })

  describe('#view', function () {
    it('should return a single row', function (done) {
      db.view('test', 'testView', {})
      .then(function (res) {
        res.should.be.an.Object()
        res.rows.should.be.an.Array()
        res.rows.length.should.equal(1)
        res.rows[0].key.should.equal('Will Conant')
        done()
      })
    })
  })

  describe('#put', function () {
    it('should treat conflicts as expected', function (done) {
      const doc = { _id: 'put-test' }
      db.put(doc)
      .then(function (resp) {
        db.put(doc)
        .then((res) => done(new Error('should not have resolved')))
        .catch(function (err) {
          err.body.error.should.equal('conflict')
          done()
        })
      })
    })
  })

  describe('#post', function () {
    it('should treat conflicts as errors', function (done) {
      const doc = { _id: 'post-test' }
      db.post(doc)
      .then((res) => db.post(doc))
      .then((res) => done(new Error('should not have resolved')))
      // got the expected error
      .catch((err) => done()) // eslint-disable-line handle-callback-err
    })
  })

  describe('#batch', function () {
    it('should ignore conflicts', function (done) {
      const doc = { _id: 'batch-test' }
      var origRev
      db.post(doc)
      .then(function (res) {
        origRev = res.rev
        db.batch(doc)
      })
      .delay(500)
      .then((res) => db.get(doc._id))
      .then((res) => res._rev.should.equal(origRev))
      .then(() => done())
    })
  })

  describe('#exists', function () {
    it('should return true for existing doc', function (done) {
      db.exists('person-1')
      .then(function (res) {
        res.should.equal(true)
        done()
      })
    })

    it('should return false for non-existent doc', function (done) {
      db.exists('does-not-exist')
      .then(function (res) {
        res.should.equal(false)
        done()
      })
    })
  })

  describe('#info', function () {
    it('should return the db info', function (done) {
      db.info()
      .then(function (res) {
        res.db_name.should.equal('test-cot-node')
        done()
      })
    })
  })

  describe('#update', function () {
    it('should apply the passed function to the doc', function (done) {
      db.update('person-1', function (doc) {
        doc.b = 2
        return doc
      })
      .then(() => db.get('person-1'))
      .then(function (doc) {
        doc.b.should.equal(2)
        done()
      })
    })

    it('should create the doc if missing', function (done) {
      db.update('does-not-exist', function (doc) {
        doc.hello = 123
        return doc
      })
      .then(() => db.get('does-not-exist'))
      .then(function (doc) {
        doc.hello.should.equal(123)
        done()
      })
    })
  })

  describe('#bulk', function () {
    it('should post all the passed docs', function (done) {
      db.bulk([
        { _id: 'person-2', type: 'person', name: 'Bobby Lapointe' },
        { _id: 'person-3', type: 'person', name: 'Jean Valjean' },
        { _id: 'person-4', type: 'person', name: 'Rose Tyler' }
      ])
      .then(function (res) {
        res.length.should.equal(3)
        res.should.be.an.Array()
        res[0].id.should.equal('person-2')
        res[1].id.should.equal('person-3')
        res[2].id.should.equal('person-4')
        done()
      })
    })
  })

  describe('#fetch', function () {
    it('should return all the docs requested', function (done) {
      db.bulk([
        { _id: 'person-2', type: 'person', name: 'Bobby Lapointe' },
        { _id: 'person-3', type: 'person', name: 'Jean Valjean' },
        { _id: 'person-4', type: 'person', name: 'Rose Tyler' }
      ])
      .then(function (res) {
        db.fetch([ 'person-2', 'person-4' ])
        .then(function (res) {
          res.should.be.an.Array()
          res.length.should.equal(2)
          res[0]._id.should.equal('person-2')
          res[1]._id.should.equal('person-4')
          done()
        })
      })
    })
  })
})