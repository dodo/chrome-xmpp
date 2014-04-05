module.exports = (grunt) ->

    grunt.initConfig
        pkg: grunt.file.readJSON('package.json')
        browserify:
            app:
                files:
                    'app/background.js': ['app/app.js']
                options:
                    alias:( "#{src}:#{tgt}" for tgt, src of require('sawrocket-xmpp/package').browser)
            extension:
                files:
                    'extension/background.js': ['extension/lib/background.js']
                    'extension/injectxmpp.js': ['extension/lib/injectxmpp.js']
                    'extension/db.js': ['extension/lib/db.js']
            addon:
                files:
                    'addon/background.js': ['addon/lib/background.js']

    grunt.loadNpmTasks 'grunt-browserify'

    grunt.registerTask 'default', [
        'browserify:app'
        'browserify:extension'
        'browserify:addon'
    ]
    grunt.registerTask 'app', [
        'browserify:app'
    ]
    grunt.registerTask 'extension', [
        'browserify:extension'
    ]
    grunt.registerTask 'addon', [
        'browserify:addon'
    ]
