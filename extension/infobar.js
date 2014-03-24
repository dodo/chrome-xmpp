var id = window.location.hash.substring(1);

document.addEventListener('DOMContentLoaded', function () {

    document.getElementById('allow').addEventListener('click', function () {
        chrome.extension.sendRequest({type:'allow', id:id}, function (res) {
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

});


