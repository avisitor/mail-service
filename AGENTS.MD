To avoid duplicate code, identify common functionality shared by multiple classes or modules.
The server restarts automatically. Do not attempt to stop or start the server.
Check that the server is running with the healthz endpoint at port 3100.
Check mail-service.log to see more of the server's state
After changing code, run "npm run validate". If it does not have errors, run "npm run build".
The build compiles ts files and copies the resulting js files to the required locations. Do not edit the js files.
Get mysql credentials from the DB URL in .env
Never add credentials to git. Be especially careful not to commit the transient scripts you create to bootstrap credentials into the DB.

