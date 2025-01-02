import './style.css'
import { initializeApp } from 'firebase/app'
import { createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { collection, doc, getDocs, getFirestore, query, setDoc } from 'firebase/firestore';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import firebaseConfig from './firebase-config';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Top-level elements
const loginScreen = document.querySelector<HTMLDivElement>('#loginScreen')!;
const tournamentScreen = document.querySelector<HTMLDivElement>('#tournamentScreen')!;

// Login form elements
const nameSelect = document.querySelector<HTMLSelectElement>('#name')!;
const emailInput = document.querySelector<HTMLInputElement>('#email')!;
const passwordInput = document.querySelector<HTMLInputElement>('#password')!;
const registerButton = document.querySelector<HTMLButtonElement>('#register')!;
const signInButton = document.querySelector<HTMLButtonElement>('#sign-in')!;
const message = document.querySelector<HTMLParagraphElement>('#message')!;

// Fish submission form elements
const fishSubmitButton = document.querySelector<HTMLButtonElement>('#fishSubmit')!;
const fishSubmitErrorMessage = document.querySelector<HTMLParagraphElement>('#fishSubmitErrorMessage')!;
const lengthInput = document.querySelector<HTMLInputElement>('#length')!;
const speciesSelect = document.querySelector<HTMLSelectElement>('#species')!;
const fishImageInput = document.querySelector<HTMLInputElement>('#fishImageInput')!;
const fishImagePreview = document.querySelector<HTMLImageElement>('#fishImagePreview')!;

// Fish table elements
const fishTableBody = document.querySelector<HTMLTableElement>('#fishTableBody')!;
const fishTableDialog = document.querySelector<HTMLDialogElement>('#fishTableDialog')!;
const fishTableDialogImage = document.querySelector<HTMLImageElement>('#fishTableDialogImage')!;
const fishTableDialogCloseButton = document.querySelector<HTMLButtonElement>('#fishTableDialogCloseButton')!;

interface FishSubmission {
  name: string;
  species: string;
  inches: string;
  imageUrl: string;
  timestamp: Date;
}

auth.onAuthStateChanged(user => {
  console.log(user);
  console.log(loginScreen)
  if (user) {
    loginScreen.style.display = 'none';
    tournamentScreen.style.display = 'block';
  } else {
    loginScreen.style.display = 'block';
    tournamentScreen.style.display = 'none';
  }

  // loginScreen.style.display = 'none';
  document.querySelector<HTMLDivElement>('#loginScreen')!.style.display = 'none';
});

async function getParticipants(): Promise<string[]> {
  const participants: string[] = [];
  const snapshot = await getDocs(query(collection(db, 'participants')))
  snapshot.forEach((doc) => {
    const data = doc.data();
    participants.push(data.name);
  });

  console.log(participants)
  return participants;
}

async function getFish(): Promise<FishSubmission[]> {
  const fishSubmissions: FishSubmission[] = [];
  const snapshot = await getDocs(query(collection(db, 'fish')));
  snapshot.forEach(doc => {
    const data = doc.data();
    fishSubmissions.push({
      name: data.name,
      inches: data.inches,
      species: data.species,
      imageUrl: data.imageUrl,
      timestamp: data.submittedAt.toDate(),
    })
  });

  return fishSubmissions;
}


function populateFishTable(fishSubmissions: FishSubmission[]) {
  fishSubmissions.forEach(fishSubmission => {
    console.log(fishSubmission)
    const row = document.createElement('tr');
    const timestamp = fishSubmission.timestamp.toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric' });
    row.innerHTML = `
      <td>${fishSubmission.name}</td>
      <td>${fishSubmission.species}</td>
      <td>${fishSubmission.inches}</td>
      <td><button class="viewImageButton">View Image</button></td>
      <td>${timestamp}</td>
    `;
    const viewImageButton = row.querySelector<HTMLButtonElement>('.viewImageButton')!;
    viewImageButton.addEventListener('click', () => {
      fishTableDialogImage.src = fishSubmission.imageUrl;
      fishTableDialog.showModal();
    });
    fishTableBody.appendChild(row);
  })
}

registerButton.addEventListener('click', async () => {
  // Attempt to sign in with email and password, populating message if error
  const email = emailInput!.value;
  const name = nameSelect.value;
  const password = passwordInput.value;

  createUserWithEmailAndPassword(auth, email, password).then(() => {
    setDoc(doc(db, 'participants', name), {
      name: name
    });

    emailInput.value = '';
    passwordInput.value = '';
    loginScreen.style.display = 'none';
    tournamentScreen.style.display = 'block';
  }).catch((error) => {
    message.innerText = error.message;
  });
})

signInButton.addEventListener('click', () => {
  const email = emailInput.value;
  const password = passwordInput.value;
  signInWithEmailAndPassword(auth, email, password)
    .then(() => {
      emailInput.value = '';
      passwordInput.value = '';
      loginScreen.style.display = 'none';
      tournamentScreen.style.display = 'block';
    })
    .catch((error) => {
      message.innerText = error.message;
    });
})

fishImageInput!.addEventListener('change', (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) {
    fishImagePreview.style.display = 'block';
    fishImagePreview.src = URL.createObjectURL(file);
  } else {
    // Make the preview blank if no file is selected
    fishImagePreview.src = '';
    fishImagePreview.style.display = 'none';
  }
});

fishSubmitButton.addEventListener('click', async (event) => {
  const rejectSubmission = (message: string) => {
    fishSubmitErrorMessage.innerText = message;
    event.preventDefault();
  }

  const name = nameSelect.value;
  const length = lengthInput.value;
  const species = speciesSelect.value;
  const imageFiles = fishImageInput.files;
  if (imageFiles == null) {
    rejectSubmission('File must be an image.');
    return;
  }
  const image = imageFiles[0];

  const validateFishEntry = async (name: string, length: string, species: string, image: File): Promise<string | undefined> => {
    if (!name || !length || !species || !image) {
      return 'All fields are required.';
    }

    try {
      // Await the getDocs call to ensure it completes before proceeding
      const snapshot = await getDocs(query(collection(db, 'participants')));
      const names: Array<string> = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        names.push(data.name);
      });
  
      // TODO: Name must be on users team
      if (!names.includes(name)) {
        return 'name must be a participant in the tournament.';
      }
    } catch (error) {
      console.error('Error fetching participants:', error);
      return 'Failed to fetch participants.';
    }

    if (isNaN(Number(length))) {
      return 'Length must be a number.';
    }

    // Display an error message if the image is not a valid file type
    if (!image.type.startsWith('image')) {
      return 'File must be an image.';
    }
  };

  const errorMessage = await validateFishEntry(name, length, species, image);
  if (errorMessage) {
    rejectSubmission(errorMessage);
    return;
  }

  // Store the fish image in GCS
  const res = await uploadBytes(ref(storage, `fish/${name}-${Date.now()}`), image);
  const imageUrl = await getDownloadURL(res.ref);

  setDoc(doc(db, 'fish', `${name}-${Date.now()}`), {
    name: name,
    inches: length,
    species: species,
    imageUrl: imageUrl,
    submittedAt: new Date(),
  })

  // Clear the fish submission form
  lengthInput.value = '';
  fishImageInput.value = '';
  fishImagePreview.src = '';
  fishImagePreview.style.display = 'none';
  fishSubmitErrorMessage.innerText = '';

  updateFishTable();
});

fishTableDialogCloseButton.addEventListener('click', () => {
  fishTableDialog.close();
});

getParticipants().then(participants => {
  participants.forEach(participant => {
    const option = document.createElement('option');
    option.value = participant;
    option.text = participant;
    nameSelect.appendChild(option);
  });
});

async function updateFishTable() {
  const fish = await getFish();
  // Clear fish table rows before populating
  fishTableBody.innerHTML = '';
  populateFishTable(fish);
}

updateFishTable();
