module.exports = (grunt) ->

    grunt.initConfig
        pkg: grunt.file.readJSON('package.json')
        browserify:
            app:
                files:
                    'app/background.js': ['app/src/background.js']
                options:
                    alias:( "#{src}:#{tgt}" for tgt, src of require('sawrocket-xmpp/package').browser)
            extension:
                files:
                    'extension/background.js': ['extension/src/background.js']
                    'extension/injectxmpp.js': ['extension/src/injectxmpp.js']
                    'extension/db.js': ['extension/src/db.js']
            addon:
                files:
                    'addon/background.js': ['addon/src/background.js']

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
