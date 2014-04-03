if (typeof(require) !== 'undefined') {
    Database = require('./lib/db');
}

var db = new Database('accounts', localStorage['accounts-version']);

function attachOptions(id, done) {
    db.forEach({only:id}, function (account) {
        var params = {};
        ['host', 'port', 'preferred'].forEach(function (key) {
            if (account[key])
                params[key] = account[key];
        });
        if (account['reconnect'])
            params['reconnect'] = true;
        // options to send to Account.connect
        done({
            id: id,
            jid: account['jid'],
            password: account['pw'],
            resource: account['resource'],
            params: params,
            cfg:{
                plugins:JSON.parse(localStorage['plugins'] || '[]'),
            },
        });
    });
}

if (typeof(module) !== 'undefined') {
    module.exports = attachOptions;
}
