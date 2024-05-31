echo @echo off > bin\ursoDB.cmd
echo set command=%1 >> bin\ursoDB.cmd
echo if "%command%"=="start" ( >> bin\ursoDB.cmd
echo    echo Starting services... >> bin\ursoDB.cmd
echo    forever start src\RP\index.js >> bin\ursoDB.cmd
echo    for /D %%D in (src\DNs\ND) do ( >> bin\ursoDB.cmd
echo        set /P PORT=%%D\PORT: >> bin\ursoDB.cmd
echo        set /P SERVER_ID=%%D\SERVER_ID: >> bin\ursoDB.cmd
echo        set /P DN_ID=%%D\DN_ID: >> bin\ursoDB.cmd
echo        forever start -c "cmd /c" "PORT=!PORT! DN_ID=!DN_ID! SERVER_ID=!SERVER_ID! node src\DNs\server.js" >> bin\ursoDB.cmd
echo    ) >> bin\ursoDB.cmd
echo ) else if "%command%"=="stop" ( >> bin\ursoDB.cmd
echo    echo Stopping services... >> bin\ursoDB.cmd
echo    forever stopall >> bin\ursoDB.cmd
echo ) else if "%command%"=="restart" ( >> bin\ursoDB.cmd
echo    echo Restarting services... >> bin\ursoDB.cmd
echo    forever restartall >> bin\ursoDB.cmd
echo ) else ( >> bin\ursoDB.cmd
echo    echo Usage: ursoDB {start|stop|restart} >> bin\ursoDB.cmd
echo ) >> bin\ursoDB.cmd