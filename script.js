console.log("script.js загружен");

let db;
let currentUser = null;
let allUsers = [];
let votingPeriod = null;
let cookStarVoted = false;
let cookPigVoted = false;
let waiterStarVoted = false;
let waiterPigVoted = false;

// Замените на ваш Web app URL из Google Apps Script
const GOOGLE_SHEETS_WEB_APP_URL = 'https://script.google.com/macros/s/ВАШ_ID/exec';

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM полностью загружен");

    try {
        db = firebase.firestore();
        console.log("Firestore успешно инициализирован");
    } catch (error) {
        console.error("Ошибка инициализации Firestore:", error);
        return;
    }

    checkExistingUser();
    loadUsersForAutocomplete();
    loadVotingPeriod();

    document.getElementById('registerButton').addEventListener('click', register);
    document.getElementById('voteWaiterStar').addEventListener('click', () => vote('waiter', 'star'));
    document.getElementById('voteWaiterPig').addEventListener('click', () => vote('waiter', 'pig'));
    document.getElementById('voteCookStar').addEventListener('click', () => vote('cook', 'star'));
    document.getElementById('voteCookPig').addEventListener('click', () => vote('cook', 'pig'));
    document.getElementById('adminButton').addEventListener('click', showAdminPage);
    document.getElementById('adminLoginButton').addEventListener('click', adminLogin);
    document.getElementById('backToMainButton').addEventListener('click', backToMainPage);
    document.getElementById('setVotingPeriodButton').addEventListener('click', setVotingPeriod);
    document.getElementById('clearDatabaseButton').addEventListener('click', showClearDatabaseModal);
    document.getElementById('confirmClearDatabaseButton').addEventListener('click', clearDatabase);
    document.getElementById('cancelClearDatabaseButton').addEventListener('click', closeClearDatabaseModal);
});

// Вспомогательная функция для нормализации строк
function normalizeString(str) {
    return str.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Вспомогательная функция для проверки совпадения имени и фамилии (в любом порядке)
async function findUserByName(surname, name) {
    const normalizedSurname = normalizeString(surname);
    const normalizedName = normalizeString(name);

    // Проверяем оба варианта: "фамилия имя" и "имя фамилия"
    const query1 = await db.collection('users')
        .where('normalizedSurname', '==', normalizedSurname)
        .where('normalizedName', '==', normalizedName)
        .get();

    const query2 = await db.collection('users')
        .where('normalizedSurname', '==', normalizedName)
        .where('normalizedName', '==', normalizedSurname)
        .get();

    if (!query1.empty) {
        return { doc: query1.docs[0], isReversed: false };
    } else if (!query2.empty) {
        return { doc: query2.docs[0], isReversed: true };
    } else {
        return null;
    }
}

async function loadUsersForAutocomplete() {
    try {
        const usersQuery = await db.collection('users')
            .where('registered', '==', true)
            .get();

        allUsers = [];
        usersQuery.forEach(doc => {
            const user = doc.data();
            allUsers.push(user);
        });
    } catch (error) {
        console.error("Ошибка в loadUsersForAutocomplete:", error);
    }
}

async function loadVotingPeriod() {
    try {
        const periodDoc = await db.collection('settings').doc('votingPeriod').get();
        if (periodDoc.exists) {
            votingPeriod = periodDoc.data();
            displayVotingPeriod();
        } else {
            votingPeriod = null;
            document.getElementById('votingPeriod').innerHTML = '<p>Период голосования не установлен.</p>';
        }
    } catch (error) {
        console.error("Ошибка в loadVotingPeriod:", error);
    }
}

function displayVotingPeriod() {
    const votingPeriodDiv = document.getElementById('votingPeriod');
    if (!votingPeriod) {
        votingPeriodDiv.innerHTML = '<p>Период голосования не установлен.</p>';
        return;
    }

    const startDate = new Date(votingPeriod.start.seconds * 1000);
    const endDate = new Date(votingPeriod.end.seconds * 1000);

    const formatDateTime = (date) => {
        return `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    };

    votingPeriodDiv.innerHTML = `<p>Голосование открыто с ${formatDateTime(startDate)} до ${formatDateTime(endDate)}</p>`;
}

function canVote() {
    if (!votingPeriod) return false;

    const now = new Date();
    const start = new Date(votingPeriod.start.seconds * 1000);
    const end = new Date(votingPeriod.end.seconds * 1000);

    return now >= start && now <= end;
}

async function sendToGoogleSheets(user) {
    try {
        // Проверяем, есть ли уже такой пользователь в Google Sheets
        // Поскольку у нас нет прямого доступа к чтению Google Sheets, отправляем только зарегистрированных пользователей
        if (!user.registered) {
            console.log(`Пользователь ${user.surname} ${user.name} не зарегистрирован, пропускаем отправку в Google Sheets`);
            return;
        }

        console.log("Отправка данных в Google Sheets:", user);
        const response = await fetch(GOOGLE_SHEETS_WEB_APP_URL, {
            method: 'POST',
            body: JSON.stringify({
                surname: user.surname,
                name: user.name,
                role: user.role
            }),
            headers: {
                'Content-Type': 'application/json'
            },
            mode: 'no-cors'
        });

        console.log("Ответ от Google Sheets:", response);
    } catch (error) {
        console.error("Ошибка при отправке в Google Sheets:", error);
    }
}

function updateAutocomplete(role, voteType) {
    const inputId = `${role}Input${voteType === 'star' ? 'Star' : 'Pig'}`;
    const suggestionsId = `${role}sSuggestions${voteType === 'star' ? 'Star' : 'Pig'}`;
    const input = document.getElementById(inputId);
    const suggestionsDiv = document.getElementById(suggestionsId);
    const searchTerm = normalizeString(input.value);

    suggestionsDiv.innerHTML = '';

    if (!searchTerm) {
        suggestionsDiv.classList.remove('active');
        return;
    }

    const filteredUsers = allUsers.filter(user => user.role === role);
    const matches = filteredUsers.filter(user => {
        const fullName1 = `${user.surname} ${user.name}`;
        const fullName2 = `${user.name} ${user.surname}`;
        const normalizedFullName1 = normalizeString(fullName1);
        const normalizedFullName2 = normalizeString(fullName2);

        return normalizedFullName1.includes(searchTerm) || normalizedFullName2.includes(searchTerm);
    });

    if (matches.length === 0) {
        suggestionsDiv.classList.remove('active');
        return;
    }

    matches.forEach(user => {
        const fullName = `${user.surname} ${user.name}`;
        const suggestionItem = document.createElement('div');
        suggestionItem.textContent = fullName;
        suggestionItem.addEventListener('click', () => {
            input.value = fullName;
            suggestionsDiv.innerHTML = '';
            suggestionsDiv.classList.remove('active');
        });
        suggestionsDiv.appendChild(suggestionItem);
    });

    suggestionsDiv.classList.add('active');
}

async function checkExistingUser() {
    try {
        const storedUser = localStorage.getItem('currentUser');
        if (storedUser) {
            currentUser = JSON.parse(storedUser);
            const userDoc = await db.collection('users').doc(currentUser.id).get();
            if (userDoc.exists) {
                currentUser = userDoc.data();
                document.getElementById('registration').style.display = 'none';
                document.getElementById('voting').style.display = 'block';
                document.getElementById('myVotes').style.display = 'block';
                document.getElementById('userInfo').textContent = `${currentUser.role === 'cook' ? 'Повар' : 'Официант'} ${currentUser.surname} ${currentUser.name}`;
                cookStarVoted = currentUser.hasVotedCookStar;
                cookPigVoted = currentUser.hasVotedCookPig;
                waiterStarVoted = currentUser.hasVotedWaiterStar;
                waiterPigVoted = currentUser.hasVotedWaiterPig;
                updateMyVotes();
                updateVotingSections();
            }
        }
    } catch (error) {
        console.error("Ошибка в checkExistingUser:", error);
    }
}

async function register() {
    try {
        if (localStorage.getItem('currentUser')) {
            alert('Вы уже зарегистрированы!');
            return;
        }

        const role = document.getElementById('role').value;
        const surname = document.getElementById('surname').value;
        const name = document.getElementById('name').value;

        if (!role || !surname || !name) {
            alert('Заполните все поля!');
            return;
        }

        const normalizedSurname = normalizeString(surname);
        const normalizedName = normalizeString(name);

        const existingUser = await findUserByName(surname, name);

        if (existingUser) {
            const userData = existingUser.doc.data();
            if (userData.registered) {
                alert('Пользователь уже зарегистрирован!');
                return;
            } else {
                const userId = existingUser.doc.id;
                await db.collection('users').doc(userId).update({
                    role,
                    hasVotedCookStar: false,
                    hasVotedCookPig: false,
                    hasVotedWaiterStar: false,
                    hasVotedWaiterPig: false,
                    registered: true
                });
                currentUser = { 
                    id: userId, 
                    role, 
                    surname: userData.surname,
                    name: userData.name,
                    normalizedSurname: normalizedSurname,
                    normalizedName: normalizedName,
                    hasVotedCookStar: false,
                    hasVotedCookPig: false,
                    hasVotedWaiterStar: false,
                    hasVotedWaiterPig: false,
                    registered: true 
                };
                localStorage.setItem('currentUser', JSON.stringify(currentUser));
            }
        } else {
            const userId = Date.now().toString();
            const newUser = {
                id: userId,
                role,
                surname,
                name,
                normalizedSurname,
                normalizedName,
                hasVotedCookStar: false,
                hasVotedCookPig: false,
                hasVotedWaiterStar: false,
                hasVotedWaiterPig: false,
                registered: true
            };
            await db.collection('users').doc(userId).set(newUser);
            currentUser = newUser;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            await sendToGoogleSheets(newUser); // Отправляем только зарегистрированных
        }

        document.getElementById('registration').style.display = 'none';
        
        const modal = document.getElementById('votingRulesModal');
        modal.style.display = 'block';
        
        document.getElementById('modalOkButton').onclick = () => {
            modal.style.display = 'none';
            document.getElementById('voting').style.display = 'block';
            document.getElementById('myVotes').style.display = 'block';
            document.getElementById('userInfo').textContent = `${role === 'cook' ? 'Повар' : 'Официант'} ${currentUser.surname} ${currentUser.name}`;
            updateMyVotes();
            updateVotingSections();
        };

        await loadUsersForAutocomplete();
    } catch (error) {
        console.error("Ошибка при регистрации:", error);
        alert("Произошла ошибка: " + error.message);
    }
}

async function vote(targetRole, voteType) {
    try {
        if (!currentUser) {
            alert('Сначала зарегистрируйтесь!');
            return;
        }

        if (!canVote()) {
            alert('Голосование недоступно! Проверьте период голосования.');
            return;
        }

        const targetInput = document.getElementById(`${targetRole}Input${voteType === 'star' ? 'Star' : 'Pig'}`);
        const fullName = targetInput.value.trim();

        if (!fullName) {
            alert(`Введите ${targetRole === 'waiter' ? 'официанта' : 'повара'}!`);
            return;
        }

        const parts = fullName.split(/\s+/).filter(Boolean);
        if (parts.length < 2) {
            alert('Введите полное имя (Фамилия Имя)!');
            return;
        }

        const [firstPart, secondPart] = parts;
        const existingUser = await findUserByName(firstPart, secondPart);

        if (!existingUser && currentUser.surname === firstPart && currentUser.name === secondPart) {
            alert('Нельзя голосовать за себя!');
            return;
        }

        if (existingUser && currentUser.id === existingUser.doc.id) {
            alert('Нельзя голосовать за себя!');
            return;
        }

        const voteKey = `hasVoted${targetRole === 'waiter' ? 'Waiter' : 'Cook'}${voteType === 'star' ? 'Star' : 'Pig'}`;
        if (currentUser[voteKey]) {
            alert(`Вы уже проголосовали за ${targetRole === 'waiter' ? 'официанта' : 'повара'} этим символом!`);
            return;
        }

        let targetUser;
        if (existingUser) {
            targetUser = existingUser.doc.data();
            // Если пользователь уже существует, используем его данные
            console.log(`Пользователь ${targetUser.surname} ${targetUser.name} уже существует, используем его данные`);
        } else {
            // Создаем нового пользователя, только если его нет в базе
            const targetId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
            const normalizedSurname = normalizeString(firstPart);
            const normalizedName = normalizeString(secondPart);
            targetUser = {
                id: targetId,
                role: targetRole,
                surname: firstPart,
                name: secondPart,
                normalizedSurname,
                normalizedName,
                hasVotedCookStar: false,
                hasVotedCookPig: false,
                hasVotedWaiterStar: false,
                hasVotedWaiterPig: false,
                registered: false
            };
            await db.collection('users').doc(targetId).set(targetUser);
            // Отправляем в Google Sheets только зарегистрированных пользователей
            // await sendToGoogleSheets(targetUser); // Пропускаем, так как пользователь незарегистрирован
        }

        const existingVote = await db.collection('votes')
            .where('from', '==', currentUser.id)
            .where('to', '==', targetUser.id)
            .where('type', '==', voteType)
            .get();

        if (!existingVote.empty) {
            alert('Вы уже голосовали за этого человека этим символом!');
            return;
        }

        await db.collection('votes').add({
            from: currentUser.id,
            to: targetUser.id,
            type: voteType,
            targetRole,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        currentUser[voteKey] = true;
        await db.collection('users').doc(currentUser.id).update({
            [voteKey]: true
        });
        localStorage.setItem('currentUser', JSON.stringify(currentUser));

        if (targetRole === 'cook') {
            if (voteType === 'star') cookStarVoted = true;
            if (voteType === 'pig') cookPigVoted = true;
        } else {
            if (voteType === 'star') waiterStarVoted = true;
            if (voteType === 'pig') waiterPigVoted = true;
        }

        const voteSymbol = voteType === 'star' ? '★' : '🐷';
        document.getElementById('voteMessage').textContent = `Вы проголосовали за ${targetUser.surname} ${targetUser.name} и дали ему ${voteSymbol}`;
        targetInput.value = '';

        updateMyVotes();
        updateVotingSections();
        await loadUsersForAutocomplete();
    } catch (error) {
        console.error("Ошибка при голосовании:", error);
        alert("Произошла ошибка: " + error.message);
    }
}

async function updateMyVotes() {
    try {
        const myVotesDisplay = document.getElementById('myVotesDisplay');
        if (!myVotesDisplay) return;

        myVotesDisplay.innerHTML = '';
        if (!currentUser) return;

        const myVotesQuery = await db.collection('votes')
            .where('from', '==', currentUser.id)
            .get();

        if (myVotesQuery.empty) {
            myVotesDisplay.textContent = 'Вы еще не голосовали.';
            return;
        }

        for (const voteDoc of myVotesQuery.docs) {
            const vote = voteDoc.data();
            const userDoc = await db.collection('users').doc(vote.to).get();
            const user = userDoc.data();
            const div = document.createElement('div');
            div.textContent = `${user.role === 'cook' ? 'Повар' : 'Официант'} ${user.surname} ${user.name}: ${vote.type === 'star' ? '★' : '🐷'}`;
            myVotesDisplay.appendChild(div);
        }
    } catch (error) {
        console.error("Ошибка в updateMyVotes:", error);
    }
}

async function updateCooksList() {
    try {
        const cooksList = document.getElementById('cooksList');
        if (!cooksList) return;

        cooksList.innerHTML = '';
        const cooksQuery = await db.collection('users')
            .where('role', '==', 'cook')
            .where('registered', '==', true)
            .get();

        if (cooksQuery.empty) {
            cooksList.textContent = 'Нет зарегистрированных поваров.';
            return;
        }

        let index = 1;
        cooksQuery.forEach(doc => {
            const cook = doc.data();
            const div = document.createElement('div');
            div.textContent = `${index}. ${cook.surname} ${cook.name}`;
            cooksList.appendChild(div);
            index++;
        });
    } catch (error) {
        console.error("Ошибка в updateCooksList:", error);
    }
}

async function updateWaitersList() {
    try {
        const waitersList = document.getElementById('waitersList');
        if (!waitersList) return;

        waitersList.innerHTML = '';
        const waitersQuery = await db.collection('users')
            .where('role', '==', 'waiter')
            .where('registered', '==', true)
            .get();

        if (waitersQuery.empty) {
            waitersList.textContent = 'Нет зарегистрированных официантов.';
            return;
        }

        let index = 1;
        waitersQuery.forEach(doc => {
            const waiter = doc.data();
            const div = document.createElement('div');
            div.textContent = `${index}. ${waiter.surname} ${waiter.name}`;
            waitersList.appendChild(div);
            index++;
        });
    } catch (error) {
        console.error("Ошибка в updateWaitersList:", error);
    }
}

function updateVotingSections() {
    const voteSection = document.getElementById('voting');
    const listsSection = document.getElementById('lists');
    const waiterStarSection = document.getElementById('waiterStarSection');
    const waiterPigSection = document.getElementById('waiterPigSection');
    const cookStarSection = document.getElementById('cookStarSection');
    const cookPigSection = document.getElementById('cookPigSection');

    waiterStarSection.style.display = waiterStarVoted ? 'none' : 'block';
    waiterPigSection.style.display = waiterPigVoted ? 'none' : 'block';
    cookStarSection.style.display = cookStarVoted ? 'none' : 'block';
    cookPigSection.style.display = cookPigVoted ? 'none' : 'block';

    if (cookStarVoted && cookPigVoted && waiterStarVoted && waiterPigVoted) {
        voteSection.style.display = 'none';
        listsSection.style.display = 'block';
        updateCooksList();
        updateWaitersList();
    } else {
        listsSection.style.display = 'none';
    }
}

function showAdminPage() {
    document.getElementById('mainPage').style.display = 'none';
    document.getElementById('adminPage').style.display = 'block';
}

function backToMainPage() {
    document.getElementById('adminPage').style.display = 'none';
    document.getElementById('mainPage').style.display = 'block';
    document.getElementById('adminLogin').value = '';
    document.getElementById('adminPassword').value = '';
    document.getElementById('adminError').textContent = '';
    document.getElementById('adminResults').style.display = 'none';
}

async function adminLogin() {
    const login = document.getElementById('adminLogin').value;
    const password = document.getElementById('adminPassword').value;
    const errorDiv = document.getElementById('adminError');

    try {
        const adminQuery = await db.collection('admins')
            .where('login', '==', login)
            .where('password', '==', password)
            .get();

        if (!adminQuery.empty) {
            errorDiv.textContent = '';
            document.getElementById('adminLoginForm').style.display = 'none';
            document.getElementById('adminResults').style.display = 'block';
            await updateAdminResults();
            await updateRegistrationStats();
            await loadVotingPeriod();
            displayVotingPeriodInAdmin();
        } else {
            errorDiv.textContent = 'Неверный логин или пароль!';
        }
    } catch (error) {
        console.error("Ошибка при входе администратора:", error);
        errorDiv.textContent = 'Произошла ошибка при входе!';
    }
}

function displayVotingPeriodInAdmin() {
    const startDateInput = document.getElementById('voteStartDate');
    const startTimeInput = document.getElementById('voteStartTime');
    const endDateInput = document.getElementById('voteEndDate');
    const endTimeInput = document.getElementById('voteEndTime');

    if (votingPeriod) {
        const start = new Date(votingPeriod.start.seconds * 1000);
        const end = new Date(votingPeriod.end.seconds * 1000);

        startDateInput.value = start.toISOString().split('T')[0];
        startTimeInput.value = `${start.getHours().toString().padStart(2, '0')}:${start.getMinutes().toString().padStart(2, '0')}`;
        endDateInput.value = end.toISOString().split('T')[0];
        endTimeInput.value = `${end.getHours().toString().padStart(2, '0')}:${end.getMinutes().toString().padStart(2, '0')}`;
    }
}

async function setVotingPeriod() {
    try {
        const startDate = document.getElementById('voteStartDate').value;
        const startTime = document.getElementById('voteStartTime').value;
        const endDate = document.getElementById('voteEndDate').value;
        const endTime = document.getElementById('voteEndTime').value;

        if (!startDate || !startTime || !endDate || !endTime) {
            document.getElementById('votingPeriodMessage').textContent = 'Заполните все поля!';
            return;
        }

        const startDateTime = new Date(`${startDate}T${startTime}:00`);
        const endDateTime = new Date(`${endDate}T${endTime}:00`);

        if (startDateTime >= endDateTime) {
            document.getElementById('votingPeriodMessage').textContent = 'Дата окончания должна быть позже даты начала!';
            return;
        }

        await db.collection('settings').doc('votingPeriod').set({
            start: firebase.firestore.Timestamp.fromDate(startDateTime),
            end: firebase.firestore.Timestamp.fromDate(endDateTime)
        });

        document.getElementById('votingPeriodMessage').textContent = 'Период голосования успешно установлен!';
        document.getElementById('votingPeriodMessage').style.color = '#2ecc71';
        await loadVotingPeriod();
    } catch (error) {
        console.error("Ошибка при установке периода голосования:", error);
        document.getElementById('votingPeriodMessage').textContent = 'Произошла ошибка: ' + error.message;
    }
}

async function updateRegistrationStats() {
    try {
        const totalPeopleSpan = document.getElementById('totalPeople');
        const totalRegisteredSpan = document.getElementById('totalRegistered');
        const totalUnregisteredSpan = document.getElementById('totalUnregistered');
        const totalCooksSpan = document.getElementById('totalCooks');
        const totalWaitersSpan = document.getElementById('totalWaiters');

        const allUsersQuery = await db.collection('users').get();
        const totalPeople = allUsersQuery.size;

        const registeredUsersQuery = await db.collection('users')
            .where('registered', '==', true)
            .get();

        const totalRegistered = registeredUsersQuery.size;
        const totalUnregistered = totalPeople - totalRegistered;
        const totalCooks = registeredUsersQuery.docs.filter(doc => doc.data().role === 'cook').length;
        const totalWaiters = registeredUsersQuery.docs.filter(doc => doc.data().role === 'waiter').length;

        totalPeopleSpan.textContent = totalPeople;
        totalRegisteredSpan.textContent = totalRegistered;
        totalUnregisteredSpan.textContent = totalUnregistered;
        totalCooksSpan.textContent = totalCooks;
        totalWaitersSpan.textContent = totalWaiters;
    } catch (error) {
        console.error("Ошибка в updateRegistrationStats:", error);
    }
}

async function updateAdminResults() {
    try {
        const cooksResultsStars = document.getElementById('cooksResultsStars');
        const cooksResultsPigs = document.getElementById('cooksResultsPigs');
        const waitersResultsStars = document.getElementById('waitersResultsStars');
        const waitersResultsPigs = document.getElementById('waitersResultsPigs');

        if (!cooksResultsStars || !cooksResultsPigs || !waitersResultsStars || !waitersResultsPigs) return;

        cooksResultsStars.innerHTML = '';
        cooksResultsPigs.innerHTML = '';
        waitersResultsStars.innerHTML = '';
        waitersResultsPigs.innerHTML = '';

        const usersQuery = await db.collection('users').get();
        const usersWithVotes = [];

        for (const userDoc of usersQuery.docs) {
            const user = userDoc.data();
            const userVotesQuery = await db.collection('votes')
                .where('to', '==', user.id)
                .get();

            const stars = userVotesQuery.docs.filter(v => v.data().type === 'star').length;
            const pigs = userVotesQuery.docs.filter(v => v.data().type === 'pig').length;

            if (userVotesQuery.size > 0) {
                usersWithVotes.push({
                    ...user,
                    stars,
                    pigs
                });
            }
        }

        const displayTop5 = (users, container, type) => {
            users.sort((a, b) => b[type] - a[type]);
            const top5 = users.slice(0, 5);
            if (top5.length === 0) {
                container.textContent = `Нет результатов по ${type === 'stars' ? '★' : '🐷'}.`;
                return;
            }
            top5.forEach((user, index) => {
                const div = document.createElement('div');
                div.textContent = `${index + 1}. ${user.surname} ${user.name}: ${type === 'stars' ? '★' : '🐷'}${user[type]}`;
                container.appendChild(div);
            });
        };

        const cooks = usersWithVotes.filter(user => user.role === 'cook');
        displayTop5(cooks, cooksResultsStars, 'stars');
        displayTop5(cooks, cooksResultsPigs, 'pigs');

        const waiters = usersWithVotes.filter(user => user.role === 'waiter');
        displayTop5(waiters, waitersResultsStars, 'stars');
        displayTop5(waiters, waitersResultsPigs, 'pigs');
    } catch (error) {
        console.error("Ошибка в updateAdminResults:", error);
    }
}

function showClearDatabaseModal() {
    const modal = document.getElementById('clearDatabaseModal');
    modal.style.display = 'block';
    document.getElementById('clearDatabasePassword').value = '';
    document.getElementById('clearDatabaseError').textContent = '';
}

function closeClearDatabaseModal() {
    const modal = document.getElementById('clearDatabaseModal');
    modal.style.display = 'none';
}

async function clearDatabase() {
    const password = document.getElementById('clearDatabasePassword').value;
    const errorDiv = document.getElementById('clearDatabaseError');

    try {
        console.log("Проверка пароля для очистки базы данных...");
        const adminQuery = await db.collection('admins')
            .where('password', '==', password)
            .get();

        if (adminQuery.empty) {
            console.log("Пароль неверный!");
            errorDiv.textContent = 'Неверный пароль!';
            return;
        }

        console.log("Пароль верный, начинаем очистку...");

        console.log("Очистка коллекции users...");
        const usersQuery = await db.collection('users').get();
        console.log(`Найдено ${usersQuery.size} документов в коллекции users`);
        if (usersQuery.size > 0) {
            const batch = db.batch();
            usersQuery.forEach(doc => {
                batch.delete(doc.ref);
                console.log(`Добавлен в batch для удаления: ${doc.id}`);
            });
            await batch.commit();
            console.log("Коллекция users очищена");
        } else {
            console.log("Коллекция users пуста, пропускаем удаление");
        }

        console.log("Очистка коллекции votes...");
        const votesQuery = await db.collection('votes').get();
        console.log(`Найдено ${votesQuery.size} документов в коллекции votes`);
        if (votesQuery.size > 0) {
            const votesBatch = db.batch();
            votesQuery.forEach(doc => {
                votesBatch.delete(doc.ref);
                console.log(`Добавлен в batch для удаления: ${doc.id}`);
            });
            await votesBatch.commit();
            console.log("Коллекция votes очищена");
        } else {
            console.log("Коллекция votes пуста, пропускаем удаление");
        }

        console.log("Очистка localStorage...");
        localStorage.removeItem('currentUser');
        console.log("localStorage очищен");

        console.log("Обновление интерфейса...");
        closeClearDatabaseModal();
        await updateAdminResults();
        await updateRegistrationStats();
        alert('База данных успешно очищена!');
        console.log("Очистка завершена успешно");
    } catch (error) {
        console.error("Ошибка при очистке базы данных:", error);
        errorDiv.textContent = 'Произошла ошибка: ' + error.message;
    }
}

// Скрипт для очистки дублей в Firestore
async function cleanDuplicateUsers() {
    try {
        console.log("Начинаем очистку дублей...");

        const usersQuery = await db.collection('users').get();
        const usersMap = new Map(); // Карта для хранения пользователей по нормализованному ключу
        const usersToDelete = []; // Список пользователей для удаления

        // Группируем пользователей по нормализованному имени и фамилии
        for (const doc of usersQuery.docs) {
            const user = doc.data();
            const key = `${user.normalizedSurname}-${user.normalizedName}`; // Уникальный ключ

            if (usersMap.has(key)) {
                // Если пользователь уже есть, сравниваем по registered
                const existingUser = usersMap.get(key);
                if (user.registered && !existingUser.registered) {
                    // Если текущий пользователь зарегистрирован, а существующий — нет, заменяем
                    usersToDelete.push(existingUser);
                    usersMap.set(key, { ...user, docId: doc.id });
                } else if (!user.registered && existingUser.registered) {
                    // Если текущий пользователь незарегистрирован, а существующий — зарегистрирован, удаляем текущего
                    usersToDelete.push({ ...user, docId: doc.id });
                } else {
                    // Если оба зарегистрированы или оба незарегистрированы, оставляем первого
                    usersToDelete.push({ ...user, docId: doc.id });
                }
            } else {
                usersMap.set(key, { ...user, docId: doc.id });
            }
        }

        // Удаляем дубли
        if (usersToDelete.length > 0) {
            console.log(`Найдено ${usersToDelete.length} дублей для удаления`);
            const batch = db.batch();
            for (const user of usersToDelete) {
                const userRef = db.collection('users').doc(user.docId);
                batch.delete(userRef);
                console.log(`Удаляем дубль: ${user.surname} ${user.name} (ID: ${user.docId})`);
            }
            await batch.commit();
            console.log("Дубли удалены");

            // Обновляем голоса, если удаленные пользователи были в голосах
            const votesQuery = await db.collection('votes').get();
            const votesBatch = db.batch();
            for (const voteDoc of votesQuery.docs) {
                const vote = voteDoc.data();
                const userToDelete = usersToDelete.find(u => u.docId === vote.to);
                if (userToDelete) {
                    const targetUser = usersMap.get(`${userToDelete.normalizedSurname}-${userToDelete.normalizedName}`);
                    if (targetUser) {
                        votesBatch.update(voteDoc.ref, { to: targetUser.docId });
                        console.log(`Обновляем голос: from ${vote.from} to ${targetUser.docId}`);
                    } else {
                        votesBatch.delete(voteDoc.ref);
                        console.log(`Удаляем голос: ${voteDoc.id}`);
                    }
                }
            }
            await votesBatch.commit();
            console.log("Голоса обновлены");
        } else {
            console.log("Дубли не найдены");
        }

        console.log("Очистка дублей завершена");
    } catch (error) {
        console.error("Ошибка при очистке дублей:", error);
    }
}
