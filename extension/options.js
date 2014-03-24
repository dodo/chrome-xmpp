var __slice = Array.prototype.slice;
var __indexOf = Array.prototype.indexOf;
var backport;

document.addEventListener('DOMContentLoaded', function restore() {
    var isPopup = self.location.hash === '#popup';
    if (isPopup) {
        document.getElementById('back').classList.remove('hidden');
    }
    if (!localStorage['plugins']) {
        plugins = __slice.call(
            document.querySelector('.config').getElementsByClassName('plugin')
        ).map(function (plugin) {
            plugin.checked = true;
            return plugin.id.replace(/^plugin-/, '');
        });
        localStorage['plugins'] = JSON.stringify(plugins);
    }
    updateData();
    if (localStorage['jid']) {
        chrome.extension.sendRequest({type:'status', jid:localStorage['jid']}, function (res) {
            res = res || {connected:false};
            if (res.error) return console.error(res);
            updateStatus(res);
        });
    } else updateStatus({connected:false});
    // connect directly to the packaged app
    backport = new BackPort((isPopup ? 'popup' : 'tab') + '-options')
        .on('update', function () {
            // when data can change means client must be offline
            updateData();
            updateStatus({connected:false});
        })
        .on('status', function (jid, res) {
            if (!localStorage['jid'] && res.connected)
                 localStorage['jid'] = jid; // created in popup
            if (jid === localStorage['jid'])
                updateStatus(res);
        });
    backport.dispatch(document);
});

document.getElementById('jid').addEventListener('keyup', function keyup(ev) {
    var host = document.getElementById('host');
    var value = this.value.trim();
    var i = value.lastIndexOf("@");
    if (i > -1) host.placeholder = value.substr(i + 1);
    else host.placeholder = localStorage['host'] || "localhost";
});

document.getElementById('save-jid').addEventListener('click', function save(ev) {
    localStorage["jid"] = document.getElementById("jid").value.trim();
    localStorage["pw" ] = document.getElementById("pw").value;
    if (!localStorage['jid'] || !localStorage['jid'].length)
        delete localStorage['jid'];
    updateStatus({connected:false});
    notify("status-jid", "Account Saved.");
    backport.send('update');
});

document.getElementById('save-jid-params').addEventListener('click', function save(ev) {
    var el;['host', 'port', 'preferred'].forEach(function (id) {
        el = document.getElementById(id);
        if (el.value.trim().length) localStorage[id] = el.value.trim();
        else delete localStorage[id];
    });
    if (localStorage['host'] && localStorage['jid']) {
        var jid = localStorage['jid'];
        var i = jid.lastIndexOf("@");
        if (i > -1 && jid.substr(i + 1) === localStorage['host']) {
            delete localStorage['host'];
            host.value = "";
        }
    }
    el = document.getElementById('reconnect');
    if (el.checked) localStorage['reconnect'] = 'on';
    else delete localStorage['reconnect'];
    notify("status-jid-params", "Parameter Saved.");
    backport.send('update');
});

document.getElementById('save-config').addEventListener('click', function save(ev) {
    var plugins = __slice.call(
        document.querySelector('.config').getElementsByClassName('plugin')
    ).filter(function (plugin) {
        return plugin.checked;
    }).map(function (plugin) {
        return plugin.id.replace(/^plugin-/, '');
    });
    localStorage['plugins'] = JSON.stringify(plugins);
    notify("status-config", "Settings Saved.");
    backport.send('update');
});


function notify(id, message) {
    // Update status to let user know something was done.
    var status = document.getElementById(id);
    status.innerHTML = message;
    setTimeout(function() {
        status.innerHTML = "";
    }, 750);
}

function enableAll() {
    document.getElementById('status').textContent = "offline";
    if (localStorage['jid']) {
        document.getElementById('connect').classList.remove('hidden');
        document.getElementById('disconnect').classList.add('hidden');
    } else {
        document.getElementById('connect').classList.add('hidden');
        document.getElementById('disconnect').classList.add('hidden');
    }
    __slice.call(document.querySelectorAll('*[disabled]')).forEach(function (el) {
        el.disabled = false;
    });
    __slice.call(document.getElementsByClassName('disabled')).forEach(function (el) {
        el.classList.remove('disabled');
    });
}

function disableAll() {
    document.getElementById('status').textContent = "online";
    if (localStorage['jid']) {
        document.getElementById('connect').classList.add('hidden');
        document.getElementById('disconnect').classList.remove('hidden');
    } else {
        document.getElementById('connect').classList.add('hidden');
        document.getElementById('disconnect').classList.add('hidden');
    }
    __slice.call(document.querySelectorAll([
        'fieldset input',
        'fieldset button',
    ].join(', '))).forEach(function (el) {
        el.disabled = true;
    });
    __slice.call(document.getElementsByTagName('fieldset')).forEach(function (el) {
        el.classList.add('disabled');
    });
}

function updateStatus(res) {
    var status = document.getElementById('status');
    if (res.connected)
        disableAll();
    else
        enableAll();
    if (localStorage['jid']) {
        status.classList.remove("hidden");
    } else {
        status.classList.add("hidden");
    }
    status.classList.remove(res.connected ? "offline" : "online");
    status.classList.add(res.connected ? "online" : "offline");
}

function updateData() {
    ['jid','pw','host','port','preferred'].forEach(function (id) {
        document.getElementById(id).value = localStorage[id] || "";
    });
    var host = document.getElementById('host');
    host.placeholder = localStorage['host'] || 'localhost';
    if (localStorage['jid']) {
        var jid = localStorage['jid'];
        var i = jid.lastIndexOf("@");
        if (i > -1) host.placeholder = jid.substr(i + 1);
    }
    document.getElementById('reconnect').checked = !!localStorage['reconnect'];
    JSON.parse(localStorage['plugins']).forEach(function (plugin) {
        document.getElementById('plugin-' + plugin).checked = true;
    });
}