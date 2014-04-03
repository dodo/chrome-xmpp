var id = window.location.hash.substring(1);

document.addEventListener('DOMContentLoaded', function () {

    document.getElementById('allow').addEventListener('click', function () {
        var aid = document.getElementById('accounts').value;
        chrome.extension.sendRequest({type:'allow', id:id, account:aid}, function (res) {
            if (res && res.error) console.error(res.error);
            window.close();
        });
    }, false);

    document.getElementById('deny').addEventListener('click', function () {
        chrome.extension.sendRequest({type:'deny', id:id}, function (res) {
            if (res && res.error) console.error(res.error);
            window.close();
        });
    }, false);

    new Database('accounts', localStorage['accounts-version'])
        .forEach(function (account) {
            if (!account['jid']) return;
            var option = document.createElement("option");
            option.setAttribute('value', account.id);
            option.textContent = account.jid;
            if (account.resource)
                option.textContent += "/" + account.resource;
            document.getElementById('accounts').appendChild(option);
        }, function () {
            if (document.getElementById('accounts').children.length) return;
            document.getElementById('no-accounts').classList.remove('hidden');
            document.getElementById('select').classList.add('hidden');
            document.getElementById('allow').disabled = true;
        })

});


