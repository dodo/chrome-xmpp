var db, backport;

document.addEventListener('DOMContentLoaded', function () {
    // connect directly to the packaged app
    backport = new BackPort('browseraction')
        .on('add', createAccount)
        .dispatch(document);

    db = new Database('accounts', localStorage['accounts-version'])
        .forEach(function (account) {
            var doc = createAccount(account);
            updateData(doc, account);
            backport.on('update', function (id) {
                if (account['id'] !== id) return;
                // when data can change means client must be offline
                updateData(doc, account);
                updateStatus(doc, account, {connected:false});
            });
            backport.on('status', function (id, res) {
                if (account['id'] !== id) return;
                updateStatus(doc, account, res);
            });
            chrome.extension.sendRequest({type:'status', id:account.id}, function (res) {
                res = res || {connected:false};
                if (res.error) return console.error(res);
                updateStatus(doc, account, res);
            });
        })
    document.getElementById('empty').classList.remove('hidden');
});

function createAccount(account) {
    if (document.getElementById('empty'))
        document.getElementById('empty').remove();
    if (document.getElementById(account['id']))
        return document.getElementById(account['id']);
    var doc = document.getElementById('account').content.cloneNode(/*deep=*/true);
    var main = document.querySelector('main');
    updateData(doc, account);
    updateStatus(doc, account, {connected:false});
    main.appendChild(doc);
    doc = main.lastElementChild;
    doc.setAttribute('id', account['id']);
    return doc;
}

function updateData(doc, account) {
    var address = doc.querySelector('address');
    var options = doc.querySelector('.options');
    options.setAttribute('href', "options.html?" + account.id + "#browseraction");
    if (account['jid']) {
        address.textContent = account['jid'];
        if (account['resource']) {
            address.textContent += "/" + account['resource'];
        }
    } else {
        address.textContent = "no jid";
    }
    address.setAttribute('title', address.textContent);
}

function updateStatus(doc, account, res) {
    var online = doc.querySelector('.online.status');
    var offline = doc.querySelector('.offline.status');
    var connectButton = doc.querySelector('button.connect');
    var disconnectButton = doc.querySelector('button.disconnect');
    connectButton.setAttribute('data-account', account.id);
    disconnectButton.setAttribute('data-account', account.id);
    disconnectButton.disabled = connectButton.disabled = !!res.disabled;
    if (account['jid']) {
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
