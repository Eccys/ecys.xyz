document.addEventListener('DOMContentLoaded', function() {
    const endpoint = 'https://www.reddit.com/r/showerthoughts/top/.json?t=all&limit=100';
    const factElement = document.getElementById('randomFact');
    const factLink = document.getElementById('randomFactLink');
    let lastPosts = [];

    const updateFact = (randomFact, postUrl) => {
        const words = randomFact.split(' ');

        if (words.length > 16) {
            factElement.innerHTML = words.join(' ').replace(/(.{48}\S*)\s+/g, '$1<br />');
        } else {
            factElement.innerText = randomFact;
        }

        factLink.href = postUrl;
    };

    // Get top posts from reddit
    const fetchAndDisplayPost = () => {
        fetch(endpoint)
            .then(response => response.json())
            .then(data => {
                let posts = data.data.children.map(child => child.data);

                // Filters to not repeat posts & ignore long ones
                posts = posts.filter(post => post.title.split(' ').length <= 30);
                posts = posts.filter(post => !lastPosts.includes(post.id));

                if (posts.length === 0) {
                    factElement.innerText = 'No new facts available.';
                    return;
                }

                const post = posts[Math.floor(Math.random() * posts.length)];
                const randomFact = post.title;
                const postUrl = `https://www.reddit.com${post.permalink}`;

                lastPosts.push(post.id);
                if (lastPosts.length > 10) {
                    lastPosts.shift();
                }

                factElement.classList.add('fade-out');

                setTimeout(() => {
                    updateFact(randomFact, postUrl);
                    factElement.classList.remove('fade-out');
                    factElement.classList.add('fade-in');

                    setTimeout(() => {
                        factElement.classList.remove('fade-in');
                    }, 1000); 
                }, 1000); 
            }) 
            .catch(error => {
                console.error('Error fetching data:', error);
                factElement.innerText = 'Could not load a fact.';
            });
    };

    setTimeout(() => {
        fetchAndDisplayPost();
        setInterval(fetchAndDisplayPost, 15000);
    }, 2000);
});

