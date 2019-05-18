const webpack = require( 'webpack' ),
      HtmlWebpackPlugin = require( 'html-webpack-plugin' ),
      WebpackNotifierPlugin = require( 'webpack-notifier' ),
      path = require( 'path' ),
      package_json = require( './package.json' ),
      develop = process.argv.indexOf( '--env.develop' ) >= 0,

      dist = path.join( __dirname, process.env.WEBPACK_DIST || 'public' ),

      plugins = [ ];

develop && plugins.push( new WebpackNotifierPlugin( { alwaysNotify: true } ) );

console.log( ( develop ? 'DEVELOP' : 'PRODUCTION' ) + ' build configuration.' );
console.log( 'My dir name is', __dirname );

let config = {
    mode: develop ? 'development' : 'production',

    entry: {
        app: './src/app.js'
    },

    output: {
        path      : dist,
        publicPath: '/',
        filename  : 'app.js'
    },

    devtool: develop && 'source-map',

    plugins: plugins,

    resolve: {
        modules   : [ 'node_modules' ],
        extensions: [ '.ts', '.js', '.jsx' ]
    },

    module: {
        rules: [
            {
                test   : /\.(js|jsx|ts)?$/,
                exclude: /(node_modules)/,
                loader : 'ts-loader'
            },
            {
                test: /\.scss$/,
                use : [
                    'style-loader', // creates style nodes from JS strings
                    'css-loader', // translates CSS into CommonJS
                    'sass-loader' // compiles Sass to CSS
                ]
            },
            {
                test  : /\.less$/,
                loader: 'style-loader!css-loader!less-loader'
            },
            {
                test  : /\.css$/,
                loader: 'style-loader!css-loader'
            },
            {
                test  : /\.woff(2)?(\?v=[0-9]\.[0-9]\.[0-9])?$/,
                loader: 'url-loader?limit=10000&minetype=application/font-woff'
            },
            {
                test  : /\.(jpg|png|ttf|eot|svg|otf)(\?v=[0-9]\.[0-9]\.[0-9])?$/,
                loader: 'file-loader?name=assets/[name].[hash:5].[ext]'
            }
        ]
    }
};

module.exports = config;
