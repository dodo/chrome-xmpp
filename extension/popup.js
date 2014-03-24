var backport;

document.addEventListener('DOMContentLoaded', function () {
//     var $ownid = document.createElement('div');
//     $ownid.textContent = "my id: " + chrome.runtime.id;
//     document.body.appendChild($ownid);
    updateData();
    if (localStorage['jid']) {
        chrome.extension.sendRequest({type:'status', jid:localStorage['jid']}, function (res) {
            res = res || {connected:false};
            if (res.error) return document.body.textContent = res.error;
            updateStatus(res);
        });
    } else updateStatus({connected:false});
    // connect directly to the packaged app
    backport = new BackPort('popup')
        .on('update', function () {
            // when data can change means client must be offline
            updateData();
            updateStatus({connected:false});
        })
        .on('status', function (jid, res) {
            if (jid === localStorage['jid'])
                updateStatus(res);
        });
    backport.dispatch(document);
});

function updateData() {
    if (localStorage['jid']) {
        document.getElementById('jid').textContent = localStorage['jid'];
        document.getElementById('no-jid').classList.add('hidden');
    } else {
        document.getElementById('jid').textContent = "no jid";
        document.getElementById('no-jid').classList.remove('hidden');
    }
}

function updateStatus(res) {
    var online = document.getElementById('online');
    var offline = document.getElementById('offline');
    var connectButton = document.getElementById('connect');
    var disconnectButton = document.getElementById('disconnect');
    disconnectButton.disabled = connectButton.disabled = !!res.disabled;
    if (localStorage['jid']) {
        if (res.connected) {
            online.classList.remove('hidden');
            offline.classList.add('hidden');
            disconnectButton.classList.remove('hidden');
            connectButton.classList.add('hidden');
        } else {
            online.classList.add('hidden');
            offline.classList.remove('hidden');
            disconnectButton.classList.add('hidden');
            connectButton.classList.remove('hidden');
        }
    } else {
        disconnectButton.classList.add('hidden');
        connectButton.classList.add('hidden');
        offline.classList.add('hidden');
        online.classList.add('hidden');
    }
}
