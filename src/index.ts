import * as yargs from 'yargs'
import {
  validateAndScrubExhaustive
} from './scrub'

yargs
  .usage('$0 <cmd> [args]')
  .command('scrub [source]', 'remove invalid endpoints and definitions from a Swagger/OpenAPI specification', (yargs) => {
    return yargs.positional('source', {
        type: 'string',
        describe: 'the file or URL where the Swagger/OpenAPI specification resides'
      })
      .option('from', {
        alias: 'f',
        description: 'the format of the Swagger specification',
        choices: ['swagger_1', 'swagger_2', 'openapi_3'],
        required: true
      })
  }, function ({source, from}) {
    validateAndScrubExhaustive(source, {
      from: from
    }).then(result => {
      process.stderr.write(JSON.stringify(result.validationErrors, null, '  '))
      process.stdout.write(JSON.stringify(result.spec, null, '  '))
    })
  })
  .help()
  .argv
