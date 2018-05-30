# swagger-scrubber

A command-line tool to remove invalid definitions from a Swagger specification.

## Installation

## Usage

```
swagger-scrubber scrub --from swagger_2 swagger.json
```

This will output a valid Swagger specification on `STDOUT` and outputs the validation errors that were found in `swagger.json` to `STDERR`.
