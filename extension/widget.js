var __slice = Array.prototype.slice;

document.addEventListener('DOMContentLoaded', function () {
    __slice.call(document.querySelectorAll('button[href]')).forEach(function (el) {
        el.addEventListener('click', function (ev) {
            self.location.href = ev.target.getAttribute('href');
        });
    });
});
