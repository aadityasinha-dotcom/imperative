#!/bin/bash

FORCE_COLOR=0

imperative-test-cli config list $1
exit $?
