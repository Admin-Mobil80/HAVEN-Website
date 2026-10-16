#!/bin/sh
# Lambda handler for the Lambda Web Adapter: /opt/bootstrap runs this script, then proxies
# requests to the Express server it starts on 127.0.0.1:$AWS_LWA_PORT.
exec node "$(dirname "$0")/index.mjs"
