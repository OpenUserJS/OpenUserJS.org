module.exports = {
    main: {
        files: [

            //root files
            {
                expand: true,
                cwd: '',
                src: 'app.js',
                dest: 'builds/'
            },
            {
                expand: true,
                cwd: '',
                src: 'fakes3.sh',
                dest: 'builds/'
            },
            //libs
            {
                expand: true,
                cwd: 'node_modules/',
                src: '**/lib/*.js',
                dest: 'builds/node_modules/'
            },
            {
                expand: true,
                cwd: 'libs/',
                src: '**/*',
                dest: 'builds/libs/'
            },
            //public
            {
                expand: true,
                cwd: 'public/',
                src: '**/*',
                dest: 'builds/public/'
            },
            //mvc
            {
                expand: true,
                cwd: 'controllers/',
                src: '**/*',
                dest: 'builds/controllers/'
            },
            {
                expand: true,
                cwd: 'models/',
                src: '**/*',
                dest: 'builds/models/'
            },
            {
                expand: true,
                cwd: 'views/',
                src: '**/*',
                dest: 'builds/views/'
            },

        ]
    }
};
