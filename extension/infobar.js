var id = window.location.hash.substring(1);

document.addEventListener('DOMContentLoaded', function () {

    document.querySelector('button[name="allow"]').addEventListener('click', function () {
        chrome.extension.sendRequest({type:'allow', id:id}, function (res) {
            if (res && res.error) console.error(res.error);
            window.close();
        });
    }, false);

    document.querySelector('button[name="deny"]').addEventListener('click', function () {
        chrome.extension.sendRequest({type:'deny', id:id}, function (res) {
            if (res && res.error) console.error(res.error);
            window.close();
        });
    }, false);

});


