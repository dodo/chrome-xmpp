var __slice = Array.prototype.slice;
var __indexOf = Array.prototype.indexOf;
var isBrowseraction, db, backport;
var accountsCounter = {};

document.addEventListener('DOMContentLoaded', function restore() {
    isBrowseraction = self.location.hash === '#browseraction';

    if (!localStorage['plugins']) {
        plugins = __slice.call(
            document.querySelector('.config').getElementsByClassName('plugin')
        ).map(function (plugin) {
            plugin.checked = true;
            return plugin.id.replace(/^plugin-/, '');
        });
        localStorage['plugins'] = JSON.stringify(plugins);
    }
    // connect directly to the packaged app
    backport = new BackPort((isBrowseraction ? 'browseraction' : 'tab') + '-options')
        .on('add', createAccount)
        .dispatch(document);

    var range;
    if (self.location.search.indexOf('?') !== -1)
        range = {only:self.location.search.substr(1)};
    db = new Database('accounts', localStorage['accounts-version'])
        .forEach(range, function (account) {
            var doc = createAccount(account);
            if (isBrowseraction) {
                var back = doc.querySelector('button.back');
                back.classList.remove('hidden');
                back.setAttribute('href', "browseraction.html");
            }
            updateData(doc, account);
        }, addNewAccountButton)
});


document.querySelector('.save-config').addEventListener('click', function (ev) {
    var plugins = __slice.call(
        document.querySelector('.config').getElementsByClassName('plugin')
    ).filter(function (plugin) {
        return plugin.checked;
    }).map(function (plugin) {
        return plugin.id.replace(/^plugin-/, '');
    });
    localStorage['plugins'] = JSON.stringify(plugins);
    notify(document, 'status-config', "Settings Saved.");
    backport.send('update');
});

function createAccount(account, docElement) {
    if (document.getElementById(account['id']))
        return document.getElementById(account['id']);
    var doc = docElement || document.getElementById('jid').content.cloneNode(/*deep=*/true);
    doc.querySelector('input[name="jid"]').addEventListener('input', function (ev) {
        var host = doc.querySelector('input[name="host"]');
        var value = this.value.trim();
        var i = value.lastIndexOf("@");
        if (i > -1) host.placeholder = value.substr(i + 1);
        else host.placeholder = account['host'] || "localhost";
        doc.querySelector('header.status var').textContent = value;
    });

    doc.querySelector('.save-jid').addEventListener('click', function (ev) {
        account["jid"] = doc.querySelector('input[name="jid"]').value.trim();
        account["pw" ] = doc.querySelector('input[name="pw"]').value;
        if (!account['jid'] || !account['jid'].length)
            delete account['jid'];
        updateStatus(doc, account, {connected:false});
        save('status-jid', "Account Saved.");
    });

    doc.querySelector('.save-jid-params').addEventListener('click', function (ev) {
        var el;['host', 'port', 'preferred', 'resource'].forEach(function (name) {
            el = doc.querySelector('input[name="' + name + '"]');
            if (el.value.trim().length) account[name] = el.value.trim();
            else delete account[name];
        });
        if (account['host'] && account['jid']) {
            var jid = account['jid'];
            var i = jid.lastIndexOf("@");
            if (i > -1 && jid.substr(i + 1) === account['host']) {
                delete account['host'];
                doc.querySelector('input[name="host"]').value = "";
            }
        }
        el = doc.querySelector('input[name="reconnect"]');
        if (el.checked) account['reconnect'] = 'on';
        else delete account['reconnect'];
        save('status-jid-params', "Parameter Saved.");
    });

    var onupdate, onstatus;
    backport.on('update', onupdate = function (id) {
        if (account['id'] !== id) return;
        // when data can change means client must be offline
        updateData(doc, account);
        updateStatus(doc, account, {connected:false});
    });
    backport.on('status', onstatus = function (id, res) {
        if (account['id'] !== id) return;
        updateStatus(doc, account, res);
    });
    chrome.extension.sendRequest({type:'status', id:account.id}, function (res) {
        res = res || {connected:false};
        if (res.error) return console.error(res);
        updateStatus(doc, account, res);
    });


    doc.querySelector('.query.delete').classList.remove('hidden');
    doc.querySelector('.query.delete').addEventListener('click', function (ev) {
        ev.target.classList.add('hidden');
        doc.querySelector('.accept.delete').classList.remove('hidden');
        doc.querySelector('.cancel.delete').classList.remove('hidden');
    });
    doc.querySelector('.cancel.delete').addEventListener('click', function (ev) {
        ev.target.classList.add('hidden');
        doc.querySelector('.accept.delete').classList.add('hidden');
        doc.querySelector('.query.delete').classList.remove('hidden');
    });
    doc.querySelector('.accept.delete').addEventListener('click', function (ev) {
        disableAll(doc, account);
        __slice.call(doc.querySelectorAll('button')).forEach(function (button) {
            button.disable = true;
        });
        backport.off('update', onupdate);
        backport.off('status', onstatus);
        remove(account.id, function () {
            doc.remove();
        });
    });

    if (!docElement) {
        document.getElementById('accounts').appendChild(doc);
        doc = document.querySelector('#accounts > address:last-child');
    }
    doc.setAttribute('id', account['id']);
    return doc;

    function save(id, message) {
        db.transaction(function (query) {
            query('put', account)
                .on('error', console.error.bind(console, '[save error]'))
                .on('success', function () {
                    backport.send('update', account.id);
                    notify(doc, id, message);
                })
        });
    }

    function remove(id, callback) {
        db.transaction(function (query) {
            query('delete', id)
                .on('error', console.error.bind(console, '[remove error]'))
                .on('success', callback)
        });
    }
}

function addNewAccountButton() {
    var el, doc = document.getElementById('jid').content.cloneNode(/*deep=*/true);
    el = doc.querySelector('address');
    el.setAttribute('title', "create Account");
    el.classList.add('new');
    el.addEventListener('click', onClick);
    el.querySelector('.status aside').textContent = "create Account";
    el.querySelector('.status').classList.remove('hidden');
    if (isBrowseraction) {
        var back = el.querySelector('button.back');
        back.classList.remove('hidden');
        back.setAttribute('href', "browseraction.html");
    }
    document.getElementById('accounts').appendChild(doc);
    el = document.querySelector('#accounts > address:last-child');
    return el;

    function onClick(ev) {
        if (ev.target.classList.contains('back'))
            return;
        el.removeEventListener('click', onClick);
        el.removeAttribute('title');
        el.classList.remove('new');
        el.querySelector('.status aside').textContent = "offline";
        el.querySelector('.status').classList.add('offline');
        save(function (account) {
            createAccount(account, el);
            updateData(el, account);
            updateStatus(el, account, {connected:false});
        }, addNewAccountButton);
    }

    function save(callback, done) {
        db.transaction(function (query) {
            var account = {id:[].map.call(crypto.getRandomValues(new Uint16Array(8)),function(x){return x.toString(16)}).join('')};
            query('put', account)
                .on('error', console.error.bind(console, '[save error]'))
                .on('success', function () {
                    backport.send('add', account);
                    callback(account);
                })
        }, done);
    }
}

function notify(doc, id, message) {
    // Update status to let user know something was done.
    var status = doc.querySelector('.' + id);
    status.innerHTML = message;
    setTimeout(function() {
        status.innerHTML = "";
    }, 750);
}

function enableAll(doc, account) {
    accountsCounter[account['id']] = false;
    var connectButton = doc.querySelector('button.connect');
    var disconnectButton = doc.querySelector('button.disconnect');
    doc.querySelector('header.status aside').textContent = "offline";
    if (account['jid']) {
        connectButton.classList.remove('hidden');
        disconnectButton.classList.add('hidden');
    } else {
        connectButton.classList.add('hidden');
        disconnectButton.classList.add('hidden');
    }
    connectButton.setAttribute('data-account', account.id);
    disconnectButton.setAttribute('data-account', account.id);
    enableElements(doc);
}

function enableElements(doc) {
    if (doc.classList.contains('config'))
        doc.classList.remove('disabled');
    __slice.call(doc.querySelectorAll('*[disabled]')).forEach(function (el) {
        el.disabled = false;
    });
    __slice.call(doc.querySelectorAll('.disabled')).forEach(function (el) {
        el.classList.remove('disabled');
    });
}

function disableAll(doc, account) {
    accountsCounter[account['id']] = true;
    var connectButton = doc.querySelector('button.connect');
    var disconnectButton = doc.querySelector('button.disconnect');
    doc.querySelector('header.status aside').textContent = "online";
    if (account['jid']) {
        connectButton.classList.add('hidden');
        disconnectButton.classList.remove('hidden');
    } else {
        connectButton.classList.add('hidden');
        disconnectButton.classList.add('hidden');
    }
    connectButton.setAttribute('data-account', account.id);
    disconnectButton.setAttribute('data-account', account.id);
    disableElements(doc);
}

function disableElements(doc) {
    if (doc.classList.contains('config'))
        doc.classList.add('disabled');
    __slice.call(doc.querySelectorAll([
        'fieldset input',
        'fieldset button',
    ].join(', '))).forEach(function (el) {
        el.disabled = true;
    });
    __slice.call(doc.querySelectorAll('fieldset')).forEach(function (el) {
        el.classList.add('disabled');
    });
}

function updateStatus(doc, account, res) {
    var status = doc.querySelector('header.status');
    if (res.connected)
        disableAll(doc, account);
    else
        enableAll(doc, account);
    if (account['jid']) {
        status.classList.remove("hidden");
    } else {
        status.classList.add("hidden");
    }
    status.classList.remove(res.connected ? "offline" : "online");
    status.classList.add(res.connected ? "online" : "offline");
    if (allAccountsOffline())
        enableElements( document.querySelector('.main.config'));
    else
        disableElements(document.querySelector('.main.config'));
}

function allAccountsOffline() {
    return Object.keys(accountsCounter).every(function (key) {
        return !accountsCounter[key];
    });
}

function updateData(doc, account) {
    ['jid','pw','host','port','preferred','resource'].forEach(function (name) {
        var el = doc.querySelector('input[name="' + name + '"]');
        el.value = account[name] || "";
    });
    var host = doc.querySelector('input[name="host"]');
    host.placeholder = account['host'] || 'localhost';
    if (account['jid']) {
        var jid = account['jid'];
        var i = jid.lastIndexOf("@");
        if (i > -1) host.placeholder = jid.substr(i + 1);
        doc.querySelector('header.status var').textContent = jid;
    }
    doc.querySelector('input[name="reconnect"]').checked = !!account['reconnect'];
    JSON.parse(localStorage['plugins']).forEach(function (plugin) {
        document.getElementById('plugin-' + plugin).checked = true;
    });
}