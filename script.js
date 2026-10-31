const DEFAULT_TEAMS = [
            "TEAM 1", "TEAM 2", "TEAM XSPARK", "ENTITY GAMING",
            "ORANGUTAN", "RECKONING ESPORTS", "BLIND ESPORTS", "MEDAL ESPORTS",
            "GLOBAL ESPORTS", "NUMEN ESPORTS", "HYDRA OFFICIAL", "GUJARAT TIGERS"
        ];

        const DEFAULT_PLACEMENT_PTS = [12, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0];
        const STORAGE_KEY = "esports_points_table_data";

        let teamsData = [];
        let matchesData = Array.from({ length: 6 }, () => []);
        let placementRules = [...DEFAULT_PLACEMENT_PTS];
        let activeTab = "teams";

        let canvas, ctx;
        let bgImage = new Image();
        let isImageLoaded = false;
        let detectedBoxes = [];
        let confirmModalInstance = null;
        let pendingModalAction = null;

        document.addEventListener("DOMContentLoaded", () => {
            canvas = document.getElementById("pointsCanvas");
            ctx = canvas.getContext("2d");
            confirmModalInstance = new bootstrap.Modal(document.getElementById('confirmModal'));

            document.getElementById('confirmModalActionBtn').addEventListener('click', () => {
                if (typeof pendingModalAction === 'function') {
                    pendingModalAction();
                }
                confirmModalInstance.hide();
            });

            loadSavedData();
            initPlacementRulesUI();
            renderTabs();
            renderTables();

            bgImage.onload = () => {
                canvas.width = bgImage.naturalWidth || bgImage.width;
                canvas.height = bgImage.naturalHeight || bgImage.height;
                isImageLoaded = true;
                detectRowBoxes();
                renderCanvas();
            };

            document.getElementById("templateUploader").addEventListener("change", (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        bgImage.src = event.target.result;
                        saveStateToLocalStorage();
                    };
                    reader.readAsDataURL(file);
                }
            });

            attachEventListeners();
            recalculateTotals();
        });

        function showCustomConfirm(title, message, onConfirm) {
            document.getElementById('confirmModalTitle').innerText = title;
            document.getElementById('confirmModalBody').innerText = message;
            pendingModalAction = onConfirm;
            confirmModalInstance.show();
        }

        function loadSavedData() {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    teamsData = parsed.teamsData || DEFAULT_TEAMS.map(name => ({ name, booyah: 0, pp: 0, kp: 0 }));
                    matchesData = parsed.matchesData || Array.from({ length: 6 }, () => DEFAULT_TEAMS.map(() => ({ rank: 12, kills: 0 })));
                    placementRules = parsed.placementRules || [...DEFAULT_PLACEMENT_PTS];
                    
                    if (parsed.numTeams) document.getElementById("numTeams").value = parsed.numTeams;
                    if (parsed.numMatches) document.getElementById("numMatches").value = parsed.numMatches;
                    if (parsed.killPointsRule !== undefined) document.getElementById("killPointsRule").value = parsed.killPointsRule;

                    if (parsed.bgImageData) {
                        bgImage.src = parsed.bgImageData;
                    }
                    showSaveStatus("Data restored from previous session");
                    return;
                } catch (e) {
                    console.error("Failed to parse saved data", e);
                }
            }

            teamsData = DEFAULT_TEAMS.map((name) => ({ name: name, booyah: 0, pp: 0, kp: 0 }));
            for (let m = 0; m < 6; m++) {
                matchesData[m] = DEFAULT_TEAMS.map(() => ({ rank: 12, kills: 0 }));
            }
        }

        function saveStateToLocalStorage() {
            const dataToSave = {
                teamsData,
                matchesData,
                placementRules: getPlacementRulesArray(),
                numTeams: parseInt(document.getElementById("numTeams").value) || 12,
                numMatches: parseInt(document.getElementById("numMatches").value) || 6,
                killPointsRule: parseFloat(document.getElementById("killPointsRule").value) || 0,
                bgImageData: isImageLoaded ? bgImage.src : null
            };

            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
                showSaveStatus("Auto-saved across all matches");
            } catch (e) {
                showSaveStatus("Save warning (image too large)", true);
            }
        }

        function showSaveStatus(msg, isError = false) {
            const el = document.getElementById("saveStatus");
            el.innerHTML = isError ? 
                `<i class="fa-solid fa-triangle-exclamation me-1"></i> ${msg}` : 
                `<i class="fa-solid fa-circle-check me-1"></i> ${msg}`;
            el.className = isError ? "text-warning fw-semibold" : "text-success fw-semibold";
        }

        function getPlacementRulesArray() {
            const arr = [];
            document.querySelectorAll(".placement-rule-input").forEach(input => {
                arr.push(parseFloat(input.value) || 0);
            });
            return arr.length ? arr : placementRules;
        }

        function initPlacementRulesUI() {
            const container = document.getElementById("placementRulesContainer");
            container.innerHTML = "";
            placementRules.forEach((pts, idx) => {
                const div = document.createElement("div");
                div.innerHTML = `
                    <label>#${idx + 1}</label>
                    <input type="number" class="form-control form-control-sm placement-rule-input" data-rank="${idx + 1}" value="${pts}" min="0">
                `;
                container.appendChild(div);
            });
        }

        function renderTabs() {
            const numMatches = parseInt(document.getElementById("numMatches").value) || 6;
            const tabButtons = document.querySelectorAll("#matchTabs .nav-link");
            
            tabButtons.forEach((btn) => {
                const tab = btn.dataset.tab;
                if (tab === "teams") {
                    btn.style.display = "block";
                } else {
                    const matchIdx = parseInt(tab.replace("m", ""));
                    btn.style.display = matchIdx <= numMatches ? "block" : "none";
                }
            });

            if (activeTab !== "teams") {
                const matchIdx = parseInt(activeTab.replace("m", ""));
                if (matchIdx > numMatches) {
                    switchTab("teams");
                }
            }
        }

        function switchTab(tabId) {
            activeTab = tabId;
            document.querySelectorAll("#matchTabs .nav-link").forEach(btn => {
                btn.classList.toggle("active", btn.dataset.tab === tabId);
            });

            document.getElementById("tab-teams").style.display = tabId === "teams" ? "block" : "none";
            document.querySelectorAll(".match-panel").forEach(panel => {
                panel.style.display = panel.id === `tab-${tabId}` ? "block" : "none";
            });
        }

        function renderTables() {
            const numTeams = parseInt(document.getElementById("numTeams").value) || 12;

            // Teams Overview Table
            const teamsContainer = document.getElementById("teamInputsContainer");
            teamsContainer.innerHTML = "";

            for (let i = 0; i < numTeams; i++) {
                const team = teamsData[i] || { name: `TEAM ${i + 1}`, booyah: 0, pp: 0, kp: 0 };
                const row = document.createElement("tr");
                row.innerHTML = `
                    <td class="text-center fw-bold text-danger">${i + 1}</td>
                    <td>
                        <input type="text" class="form-control form-control-sm team-name" data-index="${i}" value="${team.name}">
                    </td>
                    <td>
                        <input type="number" class="form-control form-control-sm team-booyah" data-index="${i}" value="${team.booyah || ''}" min="0" placeholder="">
                    </td>
                    <td>
                        <input type="number" class="form-control form-control-sm team-pp" data-index="${i}" value="${team.pp}" min="0">
                    </td>
                    <td>
                        <input type="number" class="form-control form-control-sm team-kp" data-index="${i}" value="${team.kp}" min="0">
                    </td>
                    <td class="fw-bold text-center team-total" id="total-${i}">
                        ${team.pp + team.kp}
                    </td>
                `;
                teamsContainer.appendChild(row);
            }

            // Match Panels
            const matchPanelsContainer = document.getElementById("matchPanelsContainer");
            matchPanelsContainer.innerHTML = "";

            for (let m = 0; m < 6; m++) {
                const panel = document.createElement("div");
                panel.id = `tab-m${m + 1}`;
                panel.className = "match-panel";
                panel.style.display = activeTab === `m${m + 1}` ? "block" : "none";

                let html = `
                    <table class="table table-dark-custom mb-0 align-middle">
                        <thead>
                            <tr>
                                <th style="width: 45%">Team Name</th>
                                <th style="width: 25%">Rank / Place</th>
                                <th style="width: 30%">Kills</th>
                            </tr>
                        </thead>
                        <tbody>
                `;

                for (let i = 0; i < numTeams; i++) {
                    const teamName = teamsData[i]?.name || `TEAM ${i + 1}`;
                    const mData = (matchesData[m] && matchesData[m][i]) ? matchesData[m][i] : { rank: numTeams, kills: 0 };

                    let rankOptions = "";
                    for (let r = 1; r <= numTeams; r++) {
                        rankOptions += `<option value="${r}" ${mData.rank === r ? "selected" : ""}>#${r}</option>`;
                    }

                    html += `
                        <tr>
                            <td class="fw-semibold text-truncate text-white" style="max-width: 140px;">${i + 1}. ${teamName}</td>
                            <td>
                                <select class="form-select form-select-sm match-rank" data-match="${m}" data-index="${i}">
                                    ${rankOptions}
                                </select>
                            </td>
                            <td>
                                <input type="number" class="form-control form-control-sm match-kills" data-match="${m}" data-index="${i}" value="${mData.kills}" min="0">
                            </td>
                        </tr>
                    `;
                }

                html += `</tbody></table>`;
                panel.innerHTML = html;
                matchPanelsContainer.appendChild(panel);
            }
        }

        function attachEventListeners() {
            document.getElementById("matchTabs").addEventListener("click", (e) => {
                if (e.target.classList.contains("nav-link")) {
                    switchTab(e.target.dataset.tab);
                }
            });

            document.getElementById("numMatches").addEventListener("input", () => {
                renderTabs();
                recalculateTotals();
            });

            document.getElementById("numTeams").addEventListener("input", () => {
                const numTeams = parseInt(document.getElementById("numTeams").value) || 12;
                while (teamsData.length < numTeams) {
                    teamsData.push({ name: `TEAM ${teamsData.length + 1}`, booyah: 0, pp: 0, kp: 0 });
                }
                for (let m = 0; m < 6; m++) {
                    while (matchesData[m].length < numTeams) {
                        matchesData[m].push({ rank: numTeams, kills: 0 });
                    }
                }
                renderTables();
                recalculateTotals();
            });

            document.getElementById("killPointsRule").addEventListener("input", recalculateTotals);
            document.getElementById("placementRulesContainer").addEventListener("input", recalculateTotals);

            document.getElementById("teamInputsContainer").addEventListener("input", (e) => {
                const idx = parseInt(e.target.dataset.index);
                if (e.target.classList.contains("team-name")) {
                    teamsData[idx].name = e.target.value;
                    document.querySelectorAll(`.match-panel tbody tr:nth-child(${idx + 1}) td:first-child`).forEach(cell => {
                        cell.innerText = `${idx + 1}. ${e.target.value}`;
                    });
                } else if (e.target.classList.contains("team-booyah")) {
                    teamsData[idx].booyah = parseInt(e.target.value) || 0;
                } else if (e.target.classList.contains("team-pp")) {
                    teamsData[idx].pp = parseInt(e.target.value) || 0;
                    updateRowTotal(idx);
                } else if (e.target.classList.contains("team-kp")) {
                    teamsData[idx].kp = parseInt(e.target.value) || 0;
                    updateRowTotal(idx);
                }
                renderCanvas();
                saveStateToLocalStorage();
            });

            document.getElementById("matchPanelsContainer").addEventListener("input", (e) => {
                if (e.target.classList.contains("match-rank") || e.target.classList.contains("match-kills")) {
                    const matchIdx = parseInt(e.target.dataset.match);
                    const teamIdx = parseInt(e.target.dataset.index);

                    if (e.target.classList.contains("match-rank")) {
                        matchesData[matchIdx][teamIdx].rank = parseInt(e.target.value) || 12;
                    } else if (e.target.classList.contains("match-kills")) {
                        matchesData[matchIdx][teamIdx].kills = parseInt(e.target.value) || 0;
                    }
                    recalculateTotals();
                }
            });

            document.getElementById("btnClear").addEventListener("click", clearMatchesData);
            document.getElementById("btnResetAll").addEventListener("click", resetAllData);
            document.getElementById("btnDownload").addEventListener("click", downloadCanvas);
        }

        function clearMatchesData() {
            showCustomConfirm(
                "Clear Match Entries", 
                "Are you sure you want to clear all match ranks and kills? Team names will remain intact.",
                () => {
                    const numTeams = parseInt(document.getElementById("numTeams").value) || 12;

                    for (let m = 0; m < 6; m++) {
                        matchesData[m] = [];
                        for (let i = 0; i < numTeams; i++) {
                            matchesData[m].push({ rank: numTeams, kills: 0 });
                        }
                    }

                    renderTables();
                    recalculateTotals();
                    showSaveStatus("All match entries cleared!");
                }
            );
        }

        function getPlacementPointsMap() {
            const map = {};
            document.querySelectorAll(".placement-rule-input").forEach(input => {
                const rank = parseInt(input.dataset.rank);
                map[rank] = parseFloat(input.value) || 0;
            });
            return map;
        }

        function recalculateTotals() {
            const numMatches = parseInt(document.getElementById("numMatches").value) || 6;
            const numTeams = parseInt(document.getElementById("numTeams").value) || 12;
            const killPtsRule = parseFloat(document.getElementById("killPointsRule").value) || 0;
            const placementMap = getPlacementPointsMap();

            // Track Booyahs per team
            const booyahCounts = new Array(numTeams).fill(0);

            for (let i = 0; i < numTeams; i++) {
                let totalPP = 0;
                let totalKP = 0;

                for (let m = 0; m < numMatches; m++) {
                    const mData = matchesData[m][i] || { rank: numTeams, kills: 0 };
                    totalPP += (placementMap[mData.rank] || 0);
                    totalKP += (mData.kills * killPtsRule);

                    if (mData.rank === 1) {
                        booyahCounts[i]++;
                    }
                }

                if (!teamsData[i]) {
                    teamsData[i] = { name: `TEAM ${i + 1}`, booyah: 0, pp: 0, kp: 0 };
                }

                teamsData[i].booyah = booyahCounts[i];
                teamsData[i].pp = totalPP;
                teamsData[i].kp = totalKP;

                const booyahInput = document.querySelector(`.team-booyah[data-index="${i}"]`);
                const ppInput = document.querySelector(`.team-pp[data-index="${i}"]`);
                const kpInput = document.querySelector(`.team-kp[data-index="${i}"]`);

                if (booyahInput) booyahInput.value = booyahCounts[i] > 0 ? booyahCounts[i] : "";
                if (ppInput) ppInput.value = totalPP;
                if (kpInput) kpInput.value = totalKP;

                updateRowTotal(i);
            }

            renderCanvas();
            saveStateToLocalStorage();
        }

        function updateRowTotal(index) {
            const row = document.querySelectorAll("#teamInputsContainer tr")[index];
            if (!row) return;
            const pp = parseInt(row.querySelector(".team-pp").value) || 0;
            const kp = parseInt(row.querySelector(".team-kp").value) || 0;
            row.querySelector(".team-total").innerText = pp + kp;
        }

        function detectRowBoxes() {
            ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imgData.data;
            const w = canvas.width;
            const h = canvas.height;

            const isWhite = (r, g, b) => r > 200 && g > 200 && b > 200;

            let rowHeightProfile = new Array(h).fill(0);

            for (let y = 0; y < h; y++) {
                let whitePixelCount = 0;
                for (let x = Math.floor(w * 0.25); x < Math.floor(w * 0.9); x++) {
                    let idx = (y * w + x) * 4;
                    if (isWhite(data[idx], data[idx + 1], data[idx + 2])) {
                        whitePixelCount++;
                    }
                }
                if (whitePixelCount > (w * 0.3)) {
                    rowHeightProfile[y] = 1;
                }
            }

            let detectedYRanges = [];
            let inRow = false;
            let startY = 0;

            for (let y = 0; y < h; y++) {
                if (rowHeightProfile[y] === 1 && !inRow) {
                    inRow = true;
                    startY = y;
                } else if (rowHeightProfile[y] === 0 && inRow) {
                    inRow = false;
                    if ((y - startY) > 15) {
                        detectedYRanges.push({ startY, endY: y, centerY: Math.floor((startY + y) / 2) });
                    }
                }
            }

            if (detectedYRanges.length < 12) {
                detectedYRanges = [];
                const defaultStartY = Math.floor(h * 0.35);
                const defaultStepY = Math.floor(h * 0.048);
                for (let i = 0; i < 12; i++) {
                    let centerY = defaultStartY + (i * defaultStepY);
                    detectedYRanges.push({ centerY });
                }
            }

            detectedBoxes = detectedYRanges.slice(0, 12).map((range) => {
                return {
                    centerY: range.centerY,
                    rankX: Math.floor(w * 0.125),
                    teamX: Math.floor(w * 0.310),
                    booyahX: Math.floor(w * 0.540),
                    ppX: Math.floor(w * 0.665),
                    kpX: Math.floor(w * 0.772),
                    totalX: Math.floor(w * 0.885)
                };
            });
        }

        function renderCanvas() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            if (!isImageLoaded) {
                ctx.fillStyle = '#1e293b';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#ffffff';
                ctx.font = '600 24px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('Please upload template image above', canvas.width / 2, canvas.height / 2);
                return;
            }

            ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
            ctx.textBaseline = "middle";

            const fontFam = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            const numTeams = parseInt(document.getElementById("numTeams").value) || 12;

            // Clone and sort teams descending for the Canvas template only
            let sortedTeams = teamsData.slice(0, numTeams).map((team, idx) => {
                const booyah = parseInt(team.booyah) || 0;
                const pp = parseInt(team.pp) || 0;
                const kp = parseInt(team.kp) || 0;
                return {
                    name: team.name || `TEAM ${idx + 1}`,
                    booyah: booyah,
                    pp: pp,
                    kp: kp,
                    total: pp + kp
                };
            }).sort((a, b) => {
                if (b.total !== a.total) return b.total - a.total;   // 1. Total Points
                if (b.booyah !== a.booyah) return b.booyah - a.booyah;// 2. Booyahs
                if (b.kp !== a.kp) return b.kp - a.kp;                 // 3. Kill Points (Prioritized over PP)
                return b.pp - a.pp;                                     // 4. Placement Points
            });

            // Draw sorted teams onto Canvas
            for (let i = 0; i < numTeams; i++) {
                const box = detectedBoxes[i];
                if (!box) continue;

                const team = sortedTeams[i];

                // Rank (#)
                ctx.font = `800 ${Math.floor(canvas.height * 0.02)}px ${fontFam}`;
                ctx.fillStyle = "#ffffff";
                ctx.textAlign = "center";
                ctx.fillText(i + 1, box.rankX, box.centerY);

                // Team Name
                if (team.name) {
                    let fontSize = Math.floor(canvas.height * 0.018);
                    ctx.font = `700 ${fontSize}px ${fontFam}`;
                    ctx.fillStyle = "#111111";
                    ctx.textAlign = "center";

                    let displayName = team.name.toUpperCase();
                    let fontWidth = ctx.measureText(displayName).width;
                    if (fontWidth > (canvas.width * 0.22)) {
                        ctx.font = `700 ${Math.floor(fontSize * 0.75)}px ${fontFam}`;
                    }

                    ctx.fillText(displayName, box.teamX, box.centerY);
                }

                // Stats (BOOYAH, PP, KP, Total)
                ctx.font = `700 ${Math.floor(canvas.height * 0.02)}px ${fontFam}`;
                ctx.fillStyle = "#111111";
                ctx.textAlign = "center";

                const booyahText = (team.booyah && team.booyah > 0) ? team.booyah.toString() : "";
                ctx.fillText(booyahText, box.booyahX, box.centerY);
                ctx.fillText(team.pp.toString(), box.ppX, box.centerY);
                ctx.fillText(team.kp.toString(), box.kpX, box.centerY);
                ctx.fillText(team.total.toString(), box.totalX, box.centerY);
            }
        }

        function resetAllData() {
            showCustomConfirm(
                "Reset All Data", 
                "This will clear ALL saved data and settings. Are you sure?",
                () => {
                    localStorage.removeItem(STORAGE_KEY);
                    location.reload();
                }
            );
        }

        function downloadCanvas() {
            if (!isImageLoaded) {
                showCustomConfirm("Template Missing", "Please upload a template image first!", null);
                return;
            }
            const link = document.createElement("a");
            link.download = `Points_Table_${new Date().toISOString().slice(0, 10)}.png`;
            link.href = canvas.toDataURL("image/png");
            link.click();
        }
