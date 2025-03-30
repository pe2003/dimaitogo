console.log("script.js загружен");

let db;
let currentUser = null;

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
    updateCooksList();
    updateWaitersList();
    updateAutocompleteOptions();

    // Привязка событий
    document.getElementById('registerButton').addEventListener('click', register);
    document.getElementById('voteWaiterStar').addEventListener('click', () => vote('waiter', 'star'));
    document.getElementById('voteWaiterPig').addEventListener('click', () => vote('waiter', 'pig'));
    document.getElementById('voteCookStar').addEventListener('click', () => vote('cook', 'star'));
    document.getElementById('voteCookPig').addEventListener('click', () => vote('cook', 'pig'));
    document.getElementById('adminButton').addEventListener('click', showAdminModal);
    document.getElementById('closeAdminModal').addEventListener('click', closeAdminModal);
    document.getElementById('adminLoginButton').addEventListener('click', adminLogin);
});

async function updateAutocompleteOptions() {
    try {
        const waitersListData = document.getElementById('waitersListData');
        const cooksListData = document.getElementById('cooksListData');

        if (!waitersListData || !cooksListData) {
            console.error("Элементы datalist не найдены");
            return;
        }

        waitersListData.innerHTML = '';
        cooksListData.innerHTML = '';

        const usersQuery = await db.collection('users')
            .where('registered', '==', true)
            .get();

        usersQuery.forEach(doc => {
            const user = doc.data();
            const fullName = `${user.surname} ${user.name}`;
            const option = document.createElement('option');
            option.value = fullName;
            option.textContent = fullName;

            if (user.role === 'waiter') {
                waitersListData.appendChild(option);
            } else if (user.role === 'cook') {
                cooksListData.appendChild(option);
            }
        });
    } catch (error) {
        console.error("Ошибка в updateAutocompleteOptions:", error);
    }
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
                updateMyVotes();
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

        const userQuery = await db.collection('users')
            .where('surname', '==', surname)
            .where('name', '==', name)
            .get();

        if (!userQuery.empty) {
            alert('Пользователь уже зарегистрирован!');
            return;
        }

        const userId = Date.now().toString();
        const newUser = {
            id: userId,
            role,
            surname,
            name,
            hasVotedWaiter: false,
            hasVotedCook: false,
            registered: true
        };

        await db.collection('users').doc(userId).set(newUser);
        currentUser = newUser;
        localStorage.setItem('currentUser', JSON.stringify(currentUser));

        document.getElementById('registration').style.display = 'none';
        document.getElementById('voting').style.display = 'block';
        document.getElementById('myVotes').style.display = 'block';
        document.getElementById('userInfo').textContent = `${role === 'cook' ? 'Повар' : 'Официант'} ${surname} ${name}`;
        updateMyVotes();
        updateCooksList();
        updateWaitersList();
        updateAutocompleteOptions();
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

        const targetInput = targetRole === 'waiter' ? 'waiterInput' : 'cookInput';
        const fullName = document.getElementById(targetInput).value.trim();

        if (!fullName) {
            alert(`Введите ${targetRole === 'waiter' ? 'официанта' : 'повара'}!`);
            return;
        }

        const [surname, name] = fullName.split(' ');
        if (!surname || !name) {
            alert('Введите полное имя (Фамилия Имя)!');
            return;
        }

        const hasVotedKey = targetRole === 'waiter' ? 'hasVotedWaiter' : 'hasVotedCook';
        if (currentUser[hasVotedKey]) {
            alert(`Вы уже проголосовали за ${targetRole === 'waiter' ? 'официанта' : 'повара'}!`);
            return;
        }

        let targetUserQuery = await db.collection('users')
            .where('surname', '==', surname)
            .where('name', '==', name)
            .where('role', '==', targetRole)
            .get();

        let targetUser;
        if (targetUserQuery.empty) {
            const targetId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
            targetUser = {
                id: targetId,
                role: targetRole,
                surname,
                name,
                hasVotedWaiter: false,
                hasVotedCook: false,
                registered: false
            };
            await db.collection('users').doc(targetId).set(targetUser);
        } else {
            targetUser = targetUserQuery.docs[0].data();
        }

        if (currentUser.id === targetUser.id) {
            alert('Нельзя голосовать за себя!');
            return;
        }

        const existingVote = await db.collection('votes')
            .where('from', '==', currentUser.id)
            .where('to', '==', targetUser.id)
            .get();

        if (!existingVote.empty) {
            alert('Вы уже голосовали за этого человека!');
            return;
        }

        await db.collection('votes').add({
            from: currentUser.id,
            to: targetUser.id,
            type: voteType,
            targetRole
        });

        currentUser[hasVotedKey] = true;
        await db.collection('users').doc(currentUser.id).update({
            [hasVotedKey]: true
        });
        localStorage.setItem('currentUser', JSON.stringify(currentUser));

        const voteSymbol = voteType === 'star' ? '★' : '🐷';
        document.getElementById('voteMessage').textContent = `Вы проголосовали за ${name} ${surname} и дали ему ${voteSymbol}`;
        document.getElementById(targetInput).value = '';

        updateMyVotes();
        updateCooksList();
        updateWaitersList();
        updateAutocompleteOptions();
    } catch (error) {
        console.error("Ошибка при голосовании:", error);
        alert("Произошла ошибка: " + error.message);
    }
}

async function updateMyVotes() {
    try {
        const myVotesDisplay = document.getElementById('myVotesDisplay');
        if (!myVotesDisplay) {
            console.error("Элемент myVotesDisplay не найден");
            return;
        }
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
        if (!cooksList) {
            console.error("Элемент cooksList не найден");
            return;
        }
        cooksList.innerHTML = '';

        const cooksQuery = await db.collection('users')
            .where('role', '==', 'cook')
            .where('registered', '==', true)
            .get();

        if (cooksQuery.empty) {
            cooksList.textContent = 'Нет зарегистрированных поваров.';
            return;
        }

        let index = 1; // Начинаем нумерацию с 1
        cooksQuery.forEach(doc => {
            const cook = doc.data();
            const div = document.createElement('div');
            div.textContent = `${index}. ${cook.surname} ${cook.name}`;
            cooksList.appendChild(div);
            index++; // Увеличиваем индекс
        });
    } catch (error) {
        console.error("Ошибка в updateCooksList:", error);
    }
}

async function updateWaitersList() {
    try {
        const waitersList = document.getElementById('waitersList');
        if (!waitersList) {
            console.error("Элемент waitersList не найден");
            return;
        }
        waitersList.innerHTML = '';

        const waitersQuery = await db.collection('users')
            .where('role', '==', 'waiter')
            .where('registered', '==', true)
            .get();

        if (waitersQuery.empty) {
            waitersList.textContent = 'Нет зарегистрированных официантов.';
            return;
        }

        let index = 1; // Начинаем нумерацию с 1
        waitersQuery.forEach(doc => {
            const waiter = doc.data();
            const div = document.createElement('div');
            div.textContent = `${index}. ${waiter.surname} ${waiter.name}`;
            waitersList.appendChild(div);
            index++; // Увеличиваем индекс
        });
    } catch (error) {
        console.error("Ошибка в updateWaitersList:", error);
    }
}

// Функции для администратора
function showAdminModal() {
    document.getElementById('adminModal').style.display = 'block';
}

function closeAdminModal() {
    document.getElementById('adminModal').style.display = 'none';
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
            document.getElementById('adminResults').style.display = 'block';
            await updateAdminResults();
        } else {
            errorDiv.textContent = 'Неверный логин или пароль!';
        }
    } catch (error) {
        console.error("Ошибка при входе администратора:", error);
        errorDiv.textContent = 'Произошла ошибка при входе!';
    }
}

async function updateAdminResults() {
    try {
        const cooksResults = document.getElementById('cooksResults');
        const waitersResults = document.getElementById('waitersResults');

        if (!cooksResults || !waitersResults) {
            console.error("Элементы результатов администратора не найдены");
            return;
        }

        cooksResults.innerHTML = '';
        waitersResults.innerHTML = '';

        const usersQuery = await db.collection('users').get();
        for (const userDoc of usersQuery.docs) {
            const user = userDoc.data();
            const userVotesQuery = await db.collection('votes')
                .where('to', '==', user.id)
                .get();

            const stars = userVotesQuery.docs.filter(v => v.data().type === 'star').length;
            const pigs = userVotesQuery.docs.filter(v => v.data().type === 'pig').length;

            if (userVotesQuery.size > 0) {
                const div = document.createElement('div');
                div.textContent = `${user.surname} ${user.name}: ★${stars} 🐷${pigs}`;
                if (user.role === 'cook') {
                    cooksResults.appendChild(div);
                } else if (user.role === 'waiter') {
                    waitersResults.appendChild(div);
                }
            }
        }

        if (cooksResults.children.length === 0) {
            cooksResults.textContent = 'Нет результатов для поваров.';
        }
        if (waitersResults.children.length === 0) {
            waitersResults.textContent = 'Нет результатов для официантов.';
        }
    } catch (error) {
        console.error("Ошибка в updateAdminResults:", error);
    }
}
