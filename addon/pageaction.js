var id = window.location.hash.substring(1);
var backport;

document.addEventListener('DOMContentLoaded', function () {

    chrome.extension.sendRequest({type:'status', tabId:id}, function (res) {
        res = res || [];
        if (res.error) return console.error(res);
        res.forEach(updateAccounts);
    });

    // connect directly to the background page
    backport = new BackPort(id)
        .on('status', updateAccounts)
        .dispatch(document);
});

function updateAccounts(res) {
    var  doc = document.getElementById(res.accountId);
    if (res.purge) {
        if (doc) doc.remove();
        return;
    }
    if (!doc) {
        var main = document.querySelector('main');
        doc = document.getElementById('jid').content.cloneNode(/*deep=*/true);
        doc.querySelector('button.connect').setAttribute('data-account', res.accountId);
        doc.querySelector('button.disconnect').setAttribute('data-account', res.accountId);
        updateStatus(doc, res);
        main.appendChild(doc);
        doc = main.lastElementChild;
        doc.setAttribute('id', res.accountId);
        confirmProcess(doc, 'removal', function () {
            chrome.extension.sendRequest({
                type:'remove permission',
                id:res.accountId,
            }, function (res) {
                if (res && res.error) return console.error(res);
                doc.remove();
                if (!main.querySelectorAll('address').length)
                    window.close();
            });

        });
    } else {
        console.log("update status", res)
        updateStatus(doc, res);
    }
}

function updateStatus(doc, res) {
    var jid = doc.querySelector('.jid');
    var resource = doc.querySelector('.resource');
    var online = doc.querySelector('.online.status');
    var offline = doc.querySelector('.offline.status');
    var connectButton =  doc.querySelector('button.connect');
    var disconnectButton =  doc.querySelector('button.disconnect');
    connectButton.disabled = disconnectButton.disabled = false;
    if (res.connected) {
        offline.classList.add('hidden');
        online.classList.remove('hidden');
        connectButton.classList.add('hidden');
        disconnectButton.classList.remove('hidden');
    } else {
        connectButton.classList.remove('hidden');
        disconnectButton.classList.add('hidden');
        offline.classList.remove('hidden');
        online.classList.add('hidden');
    }
    if (res.jid) {
        jid.textContent = res.jid;
        if (res.resource)
            resource.textContent = "/" + res.resource;
        else
            resource.textContent = "";
    } else {
        resource.textContent = "";
        jid.textContent = "";
    }
}
