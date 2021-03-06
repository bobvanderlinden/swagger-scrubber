#!/usr/bin/env node
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
      .option('ignore-rule', {
        alias: 'i',
        description: 'ignore a specific validation rule',
        required: false,
        type: 'array'
      })
  }, function ({ source, from, ignoreRule }) {
    validateAndScrubExhaustive(source, {
      from: from,
      ignoreValidationCodes: ignoreRule
    }).then(result => {
      process.stderr.write(JSON.stringify(result.validationErrors, null, '  '))
      process.stdout.write(JSON.stringify(result.spec, null, '  '))
    })
  })
  .command({
    command: '*',
    handler() {
      yargs.showHelp()
    }
  })
  .help()
  .argv
