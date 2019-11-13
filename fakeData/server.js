//const _ = requirefrom 'underscore'
const fastify = require('fastify')({ logger: true })
const fs = require('fs');
const path = require('path');


fastify
    .register(require('fastify-static'), {
        root: path.join(__dirname, '.'),
        prefix: '/'
    })
    .register(require('fastify-cookie'))
    .register(require('fastify-cors'), {
        origin: true
    })
    .register(require('fastify-caching'))
    .register(require('fastify-server-session'), {
        secretKey: 'qscvefbnrgm,rghjthjk1122342345qscvefbnrgm,rghjthjkl678qscvefbnrgm,rghjthjkll',
        sessionMaxAge: 900000, // 15 minutes in milliseconds
        cookie: {
            path: '/'
        }
    });

fastify.get('/conf', async (request, reply) => {
    const data = await fs.readAsText('./conf.json');
    reply.send(data);
});

const start = async () => {
    try {
        await fastify.listen(8866, "0.0.0.0");
        fastify.log.info('server listening on ' + fastify.server.address().port)
    } catch (err) {
        fastify.log.error(err);
        process.exit(1)
    }
};


start();

