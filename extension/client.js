
function attachOptions() {
    var params = {};
    ['host', 'port', 'preferred'].forEach(function (key) {
        if (localStorage[key])
            params[key] = localStorage[key];
    });
    if (localStorage['reconnect'])
        params['reconnect'] = true;
    // options to send to Account.connect
    return {
        jid: localStorage['jid'],
        password: localStorage['pw'],
        params: params,
        cfg:{
            plugins:JSON.parse(localStorage['plugins'] || '[]'),
        },
    };
}

if (typeof(module) !== 'undefined') {
    module.exports = attachOptions;
}
