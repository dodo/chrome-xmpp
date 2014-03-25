chrome-xmpp
===========

WIP

Add XMPP as Feature to your Browser.

#### how should this work?

* install app + extension
* go to the options page and enter your jid + credentials
* be happy to find window.XMPP on every website
* write website that uses this feature

#### how should this be used?

* website use window.XMPP to ask for a new connection (or access to a running connection)
* user gets asked by infobar if he/she would allow access to the xmpp connection
* user can grant different access levels to each website

#### when is this ready?

it's ready, when it's ready :)
… or you start contributing and shorten your waiting time.


#### how to check this out?

Make sure you have [grunt](https://gruntjs.com/) installed.

```bash
git clone git://github.com/dodo/chrome-xmpp.git
cd chrome-xmpp/
npm install .
grunt
```

- Goto `Chrome/chromium menu` > `Settings` > `Extensions`.
- Check `Developer mode` on.
- Click `Load unpacked extension…`
- Select `chrome-xmpp/app` and `chrome-xmpp/extension` folder.
- Be Happy :)

