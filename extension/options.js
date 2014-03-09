var __slice = Array.prototype.slice;


document.addEventListener('DOMContentLoaded', function restore() {
    ['jid','pw','host','port','preferred'].forEach(function (id) {
        if (localStorage[id])
            document.getElementById(id).value = localStorage[id];
    });
    var host = document.getElementById('host');
    host.placeholder = localStorage['host'] || 'localhost';
    if (localStorage['host'] && localStorage['jid']) {
        var jid = localStorage['jid'];
        var i = jid.lastIndexOf("@");
        if (i > -1 && jid.substr(i + 1) === localStorage['host']) {
            delete localStorage['host'];
            host.value = "";
        }
    } else if (!localStorage['host'] && localStorage['jid']) {
        var jid = localStorage['jid'];
        var i = jid.lastIndexOf("@");
        if (i > -1) host.placeholder = jid.substr(i + 1);
    }
    if (localStorage['reconnect'])
        document.getElementById('reconnect').checked = true;
    if (localStorage['plugins']) {
        JSON.parse(localStorage['plugins']).forEach(function (plugin) {
            document.getElementById('plugin-' + plugin).checked = true;
        });
    } else {
        plugins = __slice.call(
            document.querySelector('.config').querySelectorAll('.plugin')
        ).map(function (plugin) {
            plugin.checked = true;
            return plugin.id.replace(/^plugin-/, '');
        });
        localStorage['plugins'] = JSON.stringify(plugins);
    }
});

document.getElementById('jid').addEventListener('keyup', function keyup(ev) {
    var host = document.getElementById('host');
    var value = this.value.trim();
    if (host.value.trim().length) return;
    var i = value.lastIndexOf("@");
    if (i > -1) host.placeholder = value.substr(i + 1);
    else host.placeholder = "localhost";
});

document.getElementById('save-jid').addEventListener('click', function save(ev) {
    localStorage["jid"] = document.getElementById("jid").value.trim();
    localStorage["pw" ] = document.getElementById("pw").value;
    notify("status-jid", "Account Saved.");
});

document.getElementById('save-jid-params').addEventListener('click', function save(ev) {
    var el;['host', 'port', 'preferred'].forEach(function (id) {
        el = document.getElementById(id);
        if (el.value.trim().length) localStorage[id] = el.value.trim();
        else delete localStorage[id];
    });
    if (!localStorage['host'] && localStorage['jid']) {
        var jid = localStorage['jid'];
        var i = jid.lastIndexOf("@");
        if (i > -1) localStorage['host'] = jid.substr(i + 1);
    }
    el = document.getElementById('reconnect');
    if (el.checked) localStorage['reconnect'] = 'on';
    else delete localStorage['reconnect'];
    notify("status-jid-params", "Parameter Saved.");
});

document.getElementById('save-config').addEventListener('click', function save(ev) {
    var plugins = __slice.call(
        document.querySelector('.config').querySelectorAll('.plugin')
    ).filter(function (plugin) {
        return plugin.checked;
    }).map(function (plugin) {
        return plugin.id.replace(/^plugin-/, '');
    });
    localStorage['plugins'] = JSON.stringify(plugins);
    notify("status-config", "Settings Saved.");
});


function notify(id, message) {
    // Update status to let user know something was done.
    var status = document.getElementById(id);
    status.innerHTML = message;
    setTimeout(function() {
        status.innerHTML = "";
    }, 750);
}