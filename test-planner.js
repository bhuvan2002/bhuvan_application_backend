// Using global fetch in Node 20+
// Actually, since I saw "You are using Node.js 20.17.0" in the FE output, global fetch is available.

async function test() {
    const baseUrl = 'http://localhost:3000/api/plans';
    const date = '2025-12-15';

    console.log('1. Creating Plan...');
    const createRes = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            title: 'Test Plan',
            type: 'Trading',
            startTime: '10:00',
            endTime: '11:00',
            notes: 'Test notes',
            date: date
        })
    });

    if (!createRes.ok) {
        console.error('Create failed:', await createRes.text());
        return;
    }
    const createdPlan = await createRes.json();
    console.log('Created:', createdPlan);

    console.log('2. Fetching Plans...');
    const getRes = await fetch(`${baseUrl}?date=${date}`);
    const plans = await getRes.json();
    console.log('Fetched plans count:', plans.length);
    const found = plans.find(p => p.id === createdPlan.id);
    if (!found) {
        console.error('Plan not found in fetch!');
        return;
    }
    console.log('Plan found.');

    console.log('3. Updating Plan...');
    const updateRes = await fetch(`${baseUrl}/${createdPlan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ...createdPlan,
            title: 'Updated Plan'
        })
    });
    const updatedPlan = await updateRes.json();
    console.log('Updated title:', updatedPlan.title);
    if (updatedPlan.title !== 'Updated Plan') {
        console.error('Update failed check!');
    }

    console.log('4. Deleting Plan...');
    const deleteRes = await fetch(`${baseUrl}/${createdPlan.id}`, {
        method: 'DELETE'
    });
    if (!deleteRes.ok) {
        console.error('Delete failed');
    } else {
        console.log('Delete successful');
    }

    console.log('5. Verify Deletion...');
    const checkRes = await fetch(`${baseUrl}?date=${date}`);
    const checkPlans = await checkRes.json();
    const stillExists = checkPlans.find(p => p.id === createdPlan.id);
    if (stillExists) {
        console.error('Plan still exists!');
    } else {
        console.log('Plan verified gone.');
    }
}

test().catch(console.error);
