#!/bin/bash

FORCE_COLOR=0

imperative-test-cli config schema $1
exit $?