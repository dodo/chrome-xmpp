/*
 * This script binds to indexedDB
 */
var __slice = Array.prototype.slice;
var EventEmitter = require('domevents').EventEmitter;

localStorage['accounts-version'] = 1;

var SCHEMA = {
    'accounts': {keyPath:'id'},
};

module.exports = Database;
window.Database = Database;
function Database(name, version) {
    this.name = name;
    this.version = version;
    this.schema = schema = SCHEMA[name] || {};
    this.queue = [];
    new EventEmitter(indexedDB.open(name, version)).setMode('on')
        .on('error', console.error.bind(console, '[db open error]'))
        .on('success', function (ev) {
            this.db = ev.target.result;
            console.log('got db', this.db)
            this.queue.forEach(function (opts) {
                this.transaction(opts.scope, opts.done)
            }.bind(this));
            this.queue = [];
        }.bind(this))
        .on('upgradeneeded', function (ev) {
            var db = ev.target.result;
            new EventEmitter(ev.target.transaction).setMode('on')
                .on('error', console.error.bind(console,
                            '[db upgradeneeded transaction error]'))
            if (db.objectStoreNames.contains(name))
                db.deleteObjectStore(name);
            var store = db.createObjectStore(name, schema);
        }.bind(this))
}

Database.prototype.transaction = function (scope, done) {
    if (!this.db) {
        this.queue.push({scope:scope, done:done});
        return this;
    }
    var transaction = this.db.transaction([this.name], 'readwrite');
    var store = transaction.objectStore(this.name);
    if (done) new EventEmitter(transaction).setMode('on').on('complete', done);
    scope.call(this, function query(method/*, args…*/) {
        var args = __slice.call(arguments);
        args.shift(); // methos
        return new EventEmitter(store[method].apply(store, args)).setMode('on');
    });
    return this;
};

Database.prototype.forEach = function (range, iter, done) {
    if (!(range instanceof IDBKeyRange) && typeof range === 'function') {
        done = iter;
        iter = range;
        range = undefined;
    }
    if (range && !(range instanceof IDBKeyRange)) {
        if (range.only) range = IDBKeyRange.only(range.only);
        else if (range.bound) range = IDBKeyRange.bound(
                range.lower, range.upper,
                range.lowerOpen, range.upperOpen);
        else if (range.lower) range = IDBKeyRange.lowerBound(range.lower, range.open);
        else if (range.upper) range = IDBKeyRange.lowerBound(range.upper, range.open);
    }
    return this.transaction(function (query) {
        var i = 0;
        query('openCursor', range)
            .on('error', console.error.bind(console, '[db forEach error]'))
            .on('success', function (ev) {
                var cursor = ev.target.result;
                if (!cursor) return; // reached end
                iter(cursor.value, i++);
                cursor.continue();
            })
    }, done);
}
