1. To avoid duplicate code, identify common functionality shared by multiple classes or modules.
2. The server restarts automatically. Do not attempt to stop or start the server.
3. Check that the server is running with the healthz endpoint at port 3100.
4. Check mail-service.log to see more of the server's state
5. After changing code, run "npm run validate". If it does not have errors, run "npm run build".
6. The build compiles ts files and copies the resulting js files to the required locations. Do not edit the js files.
7. Get mysql credentials from the DB URL in .env
