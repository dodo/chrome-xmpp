


document.addEventListener('DOMContentLoaded', function restore() {
    if (localStorage["jid"]) document.getElementById("jid").value = localStorage["jid"];
    if (localStorage["pw" ]) document.getElementById("pw" ).value = localStorage["pw" ];
});

document.querySelector('#save').addEventListener('click', function save(ev) {
    localStorage["jid"] = document.getElementById("jid").value;
    localStorage["pw" ] = document.getElementById("pw").value;

    // Update status to let user know options were saved.
    var status = document.getElementById("status");
    status.innerHTML = "Options Saved.";
    setTimeout(function() {
        status.innerHTML = "";
    }, 750);
});