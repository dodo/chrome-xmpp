var __slice = Array.prototype.slice;

document.addEventListener('DOMContentLoaded', function () {
    __slice.call(document.querySelectorAll('button[href]')).forEach(function (el) {
        el.addEventListener('click', function (ev) {
            self.location.href = ev.target.getAttribute('href');
        });
    });
});

document.addEventListener('BackPortLoaded', function (ev) {
    var backport = ev.detail;
    document.getElementById('connect').addEventListener('click', function (ev) {
        ev.target.disabled = true;
        backport.send('connect', attachOptions());
    });
    document.getElementById('disconnect').addEventListener('click', function (ev) {
        ev.target.disabled = true;
        backport.send('disconnect', {jid:localStorage['jid']});
    });
});
